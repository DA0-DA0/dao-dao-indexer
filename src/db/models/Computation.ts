import isEqual from 'lodash.isequal'
import { Op } from 'sequelize'
import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript'

import {
  Block,
  ComputationOutput,
  FormulaType,
  TypedFormula,
  compute,
} from '@/core'
import { getTypedFormula } from '@/data'

import { Event } from './Event'
import { Transformation } from './Transformation'

@Table({
  timestamps: true,
  indexes: [
    // Formulas are deterministic, so only one output can exist for a formula
    // with args for a target address at a given block height.
    {
      unique: true,
      fields: ['targetAddress', 'formula', 'args', 'blockHeight'],
    },
    {
      fields: ['targetAddress'],
    },
    {
      fields: ['blockHeight'],
    },
    {
      fields: ['latestBlockHeightValid'],
    },
    // Speed up export invalidation queries.
    {
      fields: ['dependentEvents'],
    },
    {
      fields: ['dependentTransformations'],
    },
  ],
})
export class Computation extends Model {
  @AllowNull(false)
  @Column
  targetAddress!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  latestBlockHeightValid!: number

  // If false, the computation's output is valid up to the latest block and
  // cannot be extended. This may be false if the formula depends on the block
  // height/time.
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  validityExtendable!: boolean

  @AllowNull(false)
  @Column(DataType.TEXT)
  type!: FormulaType

  @AllowNull(false)
  @Column(DataType.TEXT)
  formula!: string

  // JSON encoded value.
  @AllowNull(false)
  @Column(DataType.TEXT)
  args!: string

  // If the key ends with a comma, it is a map prefix. Non-map-prefix keys may
  // contain a wildcard in the form of a '%'. Keys may or may not contain a
  // contract address. No contract address means it depends on all.
  // Format: ("key" | "contractAddress:key")[]
  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.TEXT))
  dependentEvents!: string[]

  // Name may contain a wildcard in the form of a '%', and may or may not
  // contain a contract address. No contract address means it depends on all.
  // Format: ("name" | "contractAddress:name")[]
  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.TEXT))
  dependentTransformations!: string[]

  // JSON encoded value.
  @AllowNull
  @Column(DataType.TEXT)
  output!: string | null

  static getOutputForValue(value: any): string | null {
    return value !== undefined && value !== null ? JSON.stringify(value) : null
  }

  static async createFromComputationOutputs(
    targetAddress: string,
    { type, name: formulaName, formula }: TypedFormula,
    args: Record<string, any>,
    computationOutputs: ComputationOutput[]
  ): Promise<Computation[]> {
    return await Computation.bulkCreate(
      computationOutputs.map(
        ({ block, value, dependencies, latestBlockHeightValid }) => ({
          targetAddress,
          type,
          formula: formulaName,
          args: JSON.stringify(args),
          dependentEvents: dependencies.events,
          dependentTransformations: dependencies.transformations,
          // If no block, the computation must not have accessed any keys. It
          // may be a constant formula, in which case it doesn't have any block
          // context and should thus use an invalid block below the first
          // possible block in case the formula is used in another computation
          // that does access keys.
          blockHeight: block?.height ?? -1,
          blockTimeUnixMs: block?.timeUnixMs ?? -1,
          latestBlockHeightValid: latestBlockHeightValid ?? block?.height ?? -1,
          validityExtendable: !formula.dynamic,
          output: Computation.getOutputForValue(value),
        })
      ),
      {
        updateOnDuplicate: [
          'dependentEvents',
          'dependentTransformations',
          'output',
          'latestBlockHeightValid',
        ],
      }
    )
  }

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }

  // Returns whether or not the computation is valid at the requested block. Try
  // to update validity if we need to and are able to.
  async updateValidityUpToBlockHeight(
    upToBlockHeight: number,
    // If undefined, default to starting after its saved latest valid block.
    startFromBlockHeight?: number
  ): Promise<boolean> {
    // If the requested block is before the computation's first valid block,
    // it's not valid for the requested block.
    if (upToBlockHeight < this.blockHeight) {
      return false
    }

    // If the computation is valid at or after the requested block, and we're
    // not starting from an earlier block, it's valid.
    if (
      startFromBlockHeight === undefined &&
      this.latestBlockHeightValid >= upToBlockHeight
    ) {
      return true
    }

    // If validity cannot be extended, it's not valid.
    if (!this.validityExtendable) {
      return false
    }

    // If passed a block height to start from, start there as long as it's after
    // the computation's start block and before the latest valid block. We start
    // after the computation's start block because we know there is an event or
    // transformation at that block. We want to find the _next_ dependency
    // starting at least after the first block.
    const minBlockHeight = Math.max(
      this.blockHeight + 1,
      Math.min(
        startFromBlockHeight ?? Infinity,
        this.latestBlockHeightValid + 1
      )
    )

    const firstNewerEvent =
      this.dependentEvents.length === 0
        ? null
        : await Event.findOne({
            where: {
              blockHeight: {
                [Op.gte]: minBlockHeight,
                [Op.lte]: upToBlockHeight,
              },
              ...Event.getWhereClauseForDependentKeys(this.dependentEvents),
            },
            order: [['blockHeight', 'ASC']],
          })

    const firstNewerTransformation =
      this.dependentTransformations.length === 0
        ? null
        : await Transformation.findOne({
            where: {
              blockHeight: {
                [Op.gte]: minBlockHeight,
                [Op.lte]: upToBlockHeight,
              },
              ...Transformation.getWhereClauseForDependentKeys(
                this.dependentTransformations
              ),
            },
            order: [['blockHeight', 'ASC']],
          })

    const firstNewerItem =
      firstNewerEvent && firstNewerTransformation
        ? firstNewerEvent.blockHeight < firstNewerTransformation.blockHeight
          ? firstNewerEvent
          : firstNewerTransformation
        : firstNewerEvent || firstNewerTransformation

    // If no new events or transformations for any of the dependent keys found,
    // this computation is still valid, so update validity.
    if (!firstNewerItem) {
      await this.update({
        latestBlockHeightValid: upToBlockHeight,
      })
      return true
    }

    // If new event or transformation found, computation is not valid at the
    // requested block. Update latest valid block to just before the new item
    // found. If `startFromBlockHeight` was passed, it's possible to set the
    // latest valid block height earlier than previously set. This should only
    // happen when a computation already exists and has been deemed valid at a
    // block for which an event gets exported or a transformation gets created
    // afterwards. This may happen if a query caches a computation for a block
    // before the exporter has caught up to that block.
    await this.update({
      latestBlockHeightValid: firstNewerItem.blockHeight - 1,
    })
    return false
  }

  // Recomputes the formula and checks if the initial block, output, or
  // dependencies change. If one of them changes, it is replaced with the new
  // computation. Otherwise, its output and validity are updated. Returns true
  // if it stayed the same, and false if it got replaced.
  async revalidate(): Promise<boolean> {
    const typedFormula = getTypedFormula(this.type, this.formula)

    const args = JSON.parse(this.args)
    const computation = await compute({
      ...typedFormula,
      targetAddress: this.targetAddress,
      args,
      block: this.block,
    })

    // If the output, initial block, or dependencies changed, delete the
    // computation.
    if (
      Computation.getOutputForValue(computation.value) !== this.output ||
      (computation.block?.height ?? -1) !== this.blockHeight ||
      !isEqual(computation.dependencies, {
        events: this.dependentEvents,
        transformations: this.dependentTransformations,
      })
    ) {
      await this.destroy()

      // Create new computation from the new output to replace this one.
      await Computation.createFromComputationOutputs(
        this.targetAddress,
        typedFormula,
        args,
        [computation]
      )

      return false
    }

    // If everything is the same but latest valid block is different, update.
    if (computation.latestBlockHeightValid !== this.latestBlockHeightValid) {
      await this.update({
        latestBlockHeightValid: computation.latestBlockHeightValid,
      })
    }

    return true
  }
}
