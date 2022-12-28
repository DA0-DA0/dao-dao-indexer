import { Op } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Block, ComputationOutput } from '../../core/types'
import { Contract } from './Contract'
import { Event } from './Event'

@Table({
  timestamps: true,
  indexes: [
    // Formulas are deterministic, so only one output can exist for a formula
    // with args on a contract at a given block height.
    {
      unique: true,
      fields: ['blockHeight', 'contractAddress', 'formula', 'args'],
    },
    {
      // Speeds up queries. Composite indexes are most efficient when equality
      // tests are first and ranges second.
      fields: ['contractAddress', 'blockHeight'],
    },
    {
      // Speeds up export invalidation queries.
      fields: ['dependentKeys', 'blockHeight'],
    },
  ],
})
export class ContractComputation extends Model {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

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

  // This formula may depend on keys in other contracts, so we need to include
  // contractAddress for each key. If the key ends with a comma, it is a map
  // prefix. Format: "contractAddress:key"[]
  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.TEXT))
  dependentKeys!: string[]

  // JSON encoded value.
  @AllowNull
  @Column(DataType.TEXT)
  output!: string | null

  static async createFromComputationOutputs(
    contractAddress: string,
    formula: string,
    args: Record<string, any>,
    ...computationOutputs: ComputationOutput[]
  ): Promise<ContractComputation[]> {
    return await ContractComputation.bulkCreate(
      computationOutputs.map(
        ({ block, value, dependentKeys, latestBlockHeightValid }) => ({
          contractAddress,
          formula,
          args: JSON.stringify(args),
          dependentKeys,
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
        updateOnDuplicate: ['dependentKeys', 'output'],
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

    // We need to check if it's valid at the requested block. If any events
    // exist after the computation's latest valid block (or earlier if passed
    // `startFromBlockHeight`), up to the requested block, the computation is no
    // longer valid.
    const firstNewerEvent = await Event.findOne({
      where: {
        blockHeight: {
          [Op.gte]:
            // If passed a block height to start from, start there as long as
            // it's after the computation's start block and before the latest
            // valid block.
            Math.max(
              this.blockHeight + 1,
              Math.min(
                startFromBlockHeight ?? Infinity,
                this.latestBlockHeightValid + 1
              )
            ),
          [Op.lte]: upToBlockHeight,
        },
        // Any key for any of the contracts.
        ...Event.getWhereClauseForDependentKeys(this.dependentKeys),
      },
      order: [['blockHeight', 'ASC']],
    })

    // If no new events for any of the dependent keys found, this is still
    // valid, so update validity.
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
      latestBlockHeightValid: firstNewerEvent.blockHeight - 1,
    })
    return false
  }
}
