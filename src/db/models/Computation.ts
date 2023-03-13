import isEqual from 'lodash.isequal'
import { ModelStatic, Op } from 'sequelize'
import {
  AllowNull,
  Column,
  DataType,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'

import {
  Block,
  ComputationOutput,
  FormulaType,
  TypedFormula,
  bigIntMax,
  bigIntMin,
  compute,
} from '@/core'
import { getTypedFormula } from '@/data'

import { DependendableEventModel } from '../types'
import { dependentKeyMatches, getDependableEventModels } from '../utils'
import { ComputationDependency } from './ComputationDependency'

@Table({
  timestamps: true,
  indexes: [
    // Formulas are deterministic, so only one output can exist for a formula
    // with args for a target address at a given block height.
    {
      unique: true,
      fields: ['targetAddress', 'type', 'formula', 'args', 'blockHeight'],
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
  blockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  latestBlockHeightValid!: string

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

  @HasMany(() => ComputationDependency, {
    foreignKey: 'computationId',
    onDelete: 'CASCADE',
  })
  dependencies!: ComputationDependency[]

  // JSON encoded value.
  @AllowNull
  @Column(DataType.TEXT)
  output!: string | null

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  // Returns whether or not the computation is valid at the requested block. Try
  // to update validity if we need to and are able to.
  async updateValidityUpToBlockHeight(
    upToBlockHeight: bigint,
    // If undefined, default to starting after its saved latest valid block.
    startFromBlockHeight?: bigint
  ): Promise<boolean> {
    // If the requested block is before the computation's first valid block,
    // it's not valid for the requested block.
    if (upToBlockHeight < BigInt(this.blockHeight)) {
      return false
    }

    // If the computation is valid at or after the requested block, and we're
    // not starting from an earlier block, it's valid.
    if (
      startFromBlockHeight === undefined &&
      BigInt(this.latestBlockHeightValid) >= upToBlockHeight
    ) {
      return true
    }

    // If validity cannot be extended, it's not valid.
    if (!this.validityExtendable) {
      return false
    }

    // If passed a block height to start from, start there as long as it's after
    // the computation's start block and before the latest valid block. We start
    // after the computation's start block because we know there is an event at
    // that block. We want to find the _next_ dependency starting at least after
    // the first block.
    const afterLatest = BigInt(this.latestBlockHeightValid) + 1n
    const minBlockHeight = bigIntMax(
      BigInt(this.blockHeight) + 1n,
      startFromBlockHeight === undefined
        ? afterLatest
        : bigIntMin(startFromBlockHeight, afterLatest)
    )

    this.dependencies ||= (await this.$get('dependencies')) ?? []

    const firstNewerEvents =
      this.dependencies.length === 0
        ? []
        : (
            await Promise.all(
              getDependableEventModels().map(async (DependableEventModel) => {
                const namespacedKeys = this.dependencies.filter(({ key }) =>
                  key.startsWith(DependableEventModel.dependentKeyNamespace)
                )
                if (namespacedKeys.length === 0) {
                  return null
                }

                return await (
                  DependableEventModel as unknown as ModelStatic<DependendableEventModel>
                ).findOne({
                  where: {
                    [DependableEventModel.blockHeightKey]: {
                      [Op.gte]: minBlockHeight,
                      [Op.lte]: upToBlockHeight,
                    },
                    ...DependableEventModel.getWhereClauseForDependentKeys(
                      namespacedKeys
                    ),
                  },
                  order: [[DependableEventModel.blockHeightKey, 'ASC']],
                })
              })
            )
          ).filter((model): model is DependendableEventModel => model !== null)

    const firstNewerEvent =
      firstNewerEvents.length > 0
        ? firstNewerEvents.reduce((newest, model) =>
            newest.block.height < model.block.height ? newest : model
          )
        : null

    // If no new events for any of the dependent keys found, this computation is
    // still valid, so update validity.
    if (!firstNewerEvent) {
      await this.update({
        latestBlockHeightValid: upToBlockHeight,
      })
      return true
    }

    // If new event found, computation is not valid at the requested block.
    // Update latest valid block to just before the new event found. If
    // `startFromBlockHeight` was passed, it's possible to set the latest valid
    // block height earlier than previously set. This should only happen when a
    // computation already exists and has been deemed valid at a block for which
    // an event gets exported afterwards. This may happen if a query caches a
    // computation for a block before the exporter has caught up to that block.
    await this.update({
      latestBlockHeightValid: firstNewerEvent.block.height - 1n,
    })
    return false
  }

  // Recomputes the formula and checks if the initial block, output, or
  // dependencies change. If one of them changes, it is replaced with the new
  // computation. Otherwise, its output and validity are updated. If the
  // computation throws an error, such as if a formula no longer exists, it is
  // deleted. Returns true if it stayed the same, and false if it got replaced
  // or deleted.
  async revalidate(): Promise<boolean> {
    let typedFormula
    let args
    let computation
    try {
      typedFormula = getTypedFormula(this.type, this.formula)
      args = JSON.parse(this.args)
      computation = await compute({
        ...typedFormula,
        targetAddress: this.targetAddress,
        args,
        block: this.block,
      })
    } catch (err) {
      // If the computation fails, delete it.
      await this.destroy()
      return false
    }

    this.dependencies ||= (await this.$get('dependencies')) ?? []

    // If the output, initial block, or dependencies changed, delete the
    // computation.
    if (
      Computation.getOutputForValue(computation.value) !== this.output ||
      (computation.block?.height ?? -1n) !== BigInt(this.blockHeight) ||
      !isEqual(
        computation.dependentKeys,
        this.dependencies.map((d) => d.dependentKey)
      )
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

    // If all seems the same, update the computation's output and validity from
    // the beginning. If it returns true, nothing changed.
    return this.validityExtendable
      ? await this.updateValidityUpToBlockHeight(
          BigInt(this.latestBlockHeightValid),
          BigInt(this.blockHeight)
        )
      : // If validity not extendable and we made it here, the computation is the same and nothing changed.
        true
  }

  static getOutputForValue(value: any): string | null {
    return value !== undefined && value !== null ? JSON.stringify(value) : null
  }

  static async createFromComputationOutputs(
    targetAddress: string,
    { type, name: formulaName, formula }: TypedFormula,
    args: Record<string, any>,
    computationOutputs: ComputationOutput[]
  ): Promise<Computation[]> {
    const computations: Computation[] = []
    for await (const {
      block,
      value,
      dependentKeys,
      latestBlockHeightValid,
    } of computationOutputs) {
      const [computation, created] = await Computation.upsert({
        targetAddress,
        type,
        formula: formulaName,
        args: JSON.stringify(args),
        // If no block, the computation must not have accessed any keys. It may
        // be a constant formula, in which case it doesn't have any block
        // context and should thus use an invalid block below the first possible
        // block in case the formula is used in another computation that does
        // access keys.
        blockHeight: block?.height ?? -1,
        blockTimeUnixMs: block?.timeUnixMs ?? -1,
        latestBlockHeightValid: latestBlockHeightValid ?? block?.height ?? -1,
        validityExtendable: !formula.dynamic,
        output: Computation.getOutputForValue(value),
      })

      const dependencies = (await computation.$get('dependencies')) ?? []

      let dependenciesToDelete: ComputationDependency[] = []
      let dependentKeysToAdd = dependentKeys
      // If the computation already exists, delete any dependencies that are no
      // longer needed, and only any new dependencies.
      if (!created) {
        dependenciesToDelete = dependencies.filter(
          (a) => !dependentKeysToAdd.some((b) => dependentKeyMatches(a, b))
        )
        dependentKeysToAdd = dependentKeysToAdd.filter(
          (a) => !dependencies.some((b) => dependentKeyMatches(a, b))
        )
      }

      await Promise.all([
        ...dependenciesToDelete.map((d) => d.destroy().catch(console.error)),
        ...(dependentKeysToAdd.length > 0
          ? [
              ComputationDependency.bulkCreate(
                dependentKeysToAdd.map((dependentKey) => ({
                  computationId: computation.id,
                  ...dependentKey,
                })),
                {
                  // No need to error if already exists. Either the computation
                  // used the same key multiple times, or we're racing against
                  // another process. If either of these happen, it's not a
                  // problem, as long as it exists.
                  ignoreDuplicates: true,
                }
              ),
            ]
          : []),
      ])

      computations.push(computation)
    }

    return computations
  }

  // For tests.
  static async getLast(): Promise<Computation | null> {
    return await Computation.findOne({
      include: ComputationDependency,
      order: [['id', 'DESC']],
    })
  }
}
