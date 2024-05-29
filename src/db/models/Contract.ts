import {
  AllowNull,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { ContractJson } from '@/core/types'
import { WasmCodeService } from '@/wasmcodes/wasm-code.service'

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
    const codeIds =
      WasmCodeService.getInstance().findWasmCodeIdsByKeys(...keys) ?? []
    return codeIds.includes(this.codeId)
  }
}
