import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Model,
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
  @AllowNull(false)
  @Column(DataType.STRING)
  declare codeKey: string

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare codeKeyId: number

  @BelongsTo(() => WasmCodeKey, 'codeKey')
  declare codeKeys: WasmCodeKey[]
}
