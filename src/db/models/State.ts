import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript'

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
  @Column(DataType.BIGINT)
  latestBlockHeight!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  latestBlockTimeUnixMs!: number

  static async getSingleton(): Promise<State | null> {
    return await State.findOne({
      where: {
        singleton: true,
      },
    })
  }

  get latestBlock(): Block {
    return {
      height: this.latestBlockHeight,
      timeUnixMs: this.latestBlockTimeUnixMs,
    }
  }
}
