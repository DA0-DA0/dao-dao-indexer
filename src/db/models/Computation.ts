import { Op } from 'sequelize'
import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript'

import { Block, ComputationOutput } from '@/core'

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

  static async createFromComputationOutputs(
    targetAddress: string,
    formula: string,
    args: Record<string, any>,
    computationOutputs: ComputationOutput[]
  ): Promise<Computation[]> {
    return await Computation.bulkCreate(
      computationOutputs.map(
        ({ block, value, dependencies, latestBlockHeightValid }) => ({
          targetAddress,
          formula,
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
          output:
            typeof value !== undefined && typeof value !== null
              ? JSON.stringify(value)
              : null,
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

  // Returns whether or not the computation is valid at the requested block.
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
}
