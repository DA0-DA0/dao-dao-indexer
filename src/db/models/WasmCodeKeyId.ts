import {
  AllowNull,
  BelongsTo,
  Column,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { WasmCodeKey } from './WasmCodeKey'

@Table({
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['codeKey', 'codeKeyId'],
    },
  ],
})
export class WasmCodeKeyId extends Model {
  @PrimaryKey
  @Column
  declare id: number

  @AllowNull(false)
  @Column
  declare codeKey: string

  @AllowNull(false)
  @Column
  declare codeKeyId: number

  @BelongsTo(() => WasmCodeKey, 'codeKey')
  declare codeKeys: WasmCodeKey[]
}
