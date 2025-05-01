import {
  AfterSync,
  AllowNull,
  Column,
  DataType,
  Model,
  Table,
} from 'sequelize-typescript'

import { Block } from '@/types'

@Table({
  timestamps: true,
  indexes: [
    {
      // Only allow one row.
      unique: true,
      fields: ['singleton'],
    },
  ],
})
export class State extends Model {
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  declare singleton: boolean

  @AllowNull(false)
  @Column(DataType.STRING)
  declare chainId: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare latestBlockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare latestBlockTimeUnixMs: string

  @AllowNull
  @Column(DataType.BIGINT)
  declare lastStakingBlockHeightExported: string | null

  @AllowNull
  @Column(DataType.BIGINT)
  declare lastWasmBlockHeightExported: string | null

  @AllowNull
  @Column(DataType.BIGINT)
  declare lastBankBlockHeightExported: string | null

  @AllowNull
  @Column(DataType.BIGINT)
  declare lastGovBlockHeightExported: string | null

  @AllowNull
  @Column(DataType.BIGINT)
  declare lastDistributionBlockHeightExported: string | null

  get latestBlock(): Block {
    return {
      height: BigInt(this.latestBlockHeight),
      timeUnixMs: BigInt(this.latestBlockTimeUnixMs),
    }
  }

  get latestBlockDate(): Date {
    return new Date(Number(this.latestBlock.timeUnixMs))
  }

  static async getSingleton(): Promise<State | null> {
    return await State.findOne({
      where: {
        singleton: true,
      },
    })
  }

  // If singleton does not exist after a sync (which is how the DB initially
  // gets set up), create it.
  @AfterSync
  static async createSingletonIfMissing(): Promise<State> {
    let state = await State.getSingleton()
    if (!state) {
      state = await State.create({
        singleton: true,
        chainId: '',
        latestBlockHeight: 0n,
        latestBlockTimeUnixMs: 0n,
        lastStakingBlockHeightExported: 0n,
        lastWasmBlockHeightExported: 0n,
        lastBankBlockHeightExported: 0n,
        lastGovBlockHeightExported: 0n,
        lastDistributionBlockHeightExported: 0n,
      })
    }

    return state
  }
}
