import {
  AfterSync,
  AllowNull,
  Column,
  DataType,
  Model,
  Table,
} from 'sequelize-typescript'

import { Block } from '@/core'

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
  @Column
  singleton!: boolean

  @AllowNull(false)
  @Column(DataType.STRING)
  chainId!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  latestBlockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  latestBlockTimeUnixMs!: string

  @AllowNull
  @Column(DataType.BIGINT)
  lastStakingBlockHeightExported!: string | null

  @AllowNull
  @Column(DataType.BIGINT)
  lastWasmBlockHeightExported!: string | null

  get latestBlock(): Block {
    return {
      height: BigInt(this.latestBlockHeight),
      timeUnixMs: BigInt(this.latestBlockTimeUnixMs),
    }
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
      })
    }

    return state
  }
}
