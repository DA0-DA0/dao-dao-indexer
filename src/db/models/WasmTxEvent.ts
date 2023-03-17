import { Op, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript'

import { Block, ComputationDependentKey, getDependentKey } from '@/core'

import { DependendableEventModel, DependentKeyNamespace } from '../types'
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
export class WasmTxEvent extends DependendableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.DATE)
  blockTimestamp!: Date

  @AllowNull(false)
  @Column(DataType.INTEGER)
  txIndex!: number

  @AllowNull(false)
  @Column(DataType.TEXT)
  messageId!: string

  @AllowNull(false)
  @Column
  action!: string

  @AllowNull(false)
  @Column
  sender!: string

  // JSON encoded value. Empty string if `reply` is not null.
  @AllowNull(false)
  @Column(DataType.TEXT)
  msg!: string

  @AllowNull
  @Column(DataType.JSONB)
  msgJson!: any | null

  // Null if `msg` is not empty.
  @AllowNull
  @Column(DataType.JSONB)
  reply!: any | null

  @AllowNull(false)
  @Column(DataType.JSONB)
  funds!: any

  @AllowNull
  @Column(DataType.JSONB)
  response!: any | null

  @AllowNull(false)
  @Column(DataType.BIGINT)
  gasUsed!: string

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      WasmTxEvent.dependentKeyNamespace,
      this.blockHeight,
      this.txIndex.toString(),
      this.messageId
    )
  }

  static dependentKeyNamespace = DependentKeyNamespace.WasmTxEvent
  static blockHeightKey: string = 'blockHeight'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    const transformedDependentKeys = dependentKeys.map(({ key }) => {
      const [blockHeight, txIndex, messageId] = key
        // 1. Remove namespace from key.
        .replace(new RegExp(`^${this.dependentKeyNamespace}:`), '')
        // 2. Replace wildcard symbol with LIKE wildcard for database query.
        .replace(/\*/g, '%')
        // 3. Split key into parts.
        .split(':')

      return {
        blockHeight,
        txIndex,
        messageId,
      }
    })

    return {
      [Op.or]: transformedDependentKeys.map(
        ({ blockHeight, txIndex, messageId }) => ({
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
