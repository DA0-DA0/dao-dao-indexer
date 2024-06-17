import {
  AllowNull,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { WasmCodeService } from '@/services/wasm-codes'
import { Block } from '@/types'

export type ContractJson = {
  address: string
  codeId: number
  instantiatedAt: {
    block: Block
    timestamp: Date
  }
}

@Table({
  timestamps: true,
})
export class Contract extends Model {
  @PrimaryKey
  @Column
  declare address: string

  @AllowNull(false)
  @Column
  declare codeId: number

  @AllowNull
  @Column(DataType.BIGINT)
  declare instantiatedAtBlockHeight: string

  @AllowNull
  @Column(DataType.BIGINT)
  declare instantiatedAtBlockTimeUnixMs: string

  @AllowNull
  @Column(DataType.DATE)
  declare instantiatedAtBlockTimestamp: Date

  get json(): ContractJson {
    return {
      address: this.address,
      codeId: this.codeId,
      instantiatedAt: {
        block: {
          height: BigInt(this.instantiatedAtBlockHeight),
          timeUnixMs: BigInt(this.instantiatedAtBlockTimeUnixMs),
        },
        timestamp: this.instantiatedAtBlockTimestamp,
      },
    }
  }

  /**
   * Return whether or not the contract matches a given set of code IDs keys
   * from the config.
   */
  matchesCodeIdKeys(...keys: string[]): boolean {
    return WasmCodeService.getInstance()
      .findWasmCodeIdsByKeys(...keys)
      .includes(this.codeId)
  }
}
