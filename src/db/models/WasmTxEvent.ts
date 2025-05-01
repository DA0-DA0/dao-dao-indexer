import { Op, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript'

import {
  Block,
  ComputationDependentKey,
  DependableEventModel,
  DependentKeyNamespace,
} from '@/types'
import { getDependentKey } from '@/utils'

import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // TXs are uniquely identifiable by their block, TX index, and message ID.
    // The TX index identifies the transaction within the block, and the message
    // ID identifies the message within the transaction.
    {
      unique: true,
      fields: ['blockHeight', 'txIndex', 'messageId'],
    },
    {
      fields: ['action'],
    },
    {
      fields: ['sender'],
    },
    {
      fields: ['blockHeight'],
    },
    {
      fields: ['blockTimeUnixMs'],
    },
  ],
})
export class WasmTxEvent extends DependableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column(DataType.STRING)
  declare contractAddress: string

  @BelongsTo(() => Contract)
  declare contract: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare blockTimestamp: Date

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare txIndex: number

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare messageId: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare action: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare sender: string

  // JSON encoded value. Empty string if `reply` is not null.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare msg: string

  @AllowNull
  @Column(DataType.JSONB)
  declare msgJson: any | null

  // Null if `msg` is not empty.
  @AllowNull
  @Column(DataType.JSONB)
  declare reply: any | null

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare funds: any

  @AllowNull
  @Column(DataType.JSONB)
  declare response: any | null

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare gasUsed: string

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      WasmTxEvent.dependentKeyNamespace,
      this.contractAddress,
      this.blockHeight,
      this.txIndex.toString(),
      this.messageId
    )
  }

  static dependentKeyNamespace = DependentKeyNamespace.WasmTxEvent
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    const transformedDependentKeys = dependentKeys.map(({ key }) => {
      const [contractAddress, blockHeight, txIndex, messageId] = key
        // 1. Remove namespace from key.
        .replace(new RegExp(`^${this.dependentKeyNamespace}:`), '')
        // 2. Replace wildcard symbol with LIKE wildcard for database query.
        .replace(/\*/g, '%')
        // 3. Split key into parts.
        .split(':')

      return {
        contractAddress,
        blockHeight,
        txIndex,
        messageId,
      }
    })

    return {
      [Op.or]: transformedDependentKeys.map(
        ({ contractAddress, blockHeight, txIndex, messageId }) => ({
          // Exact match.
          contractAddress,
          // Exact and wildcard matches.
          ...(!blockHeight || blockHeight === '*' ? {} : { blockHeight }),
          // Exact and wildcard matches.
          ...(!txIndex || txIndex === '*' ? {} : { txIndex }),
          // Exact and wildcard matches.
          ...(!messageId || messageId === '*' ? {} : { messageId }),
        })
      ),
    }
  }
}
