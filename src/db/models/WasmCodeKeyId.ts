import {
  AllowNull,
  BelongsTo,
  Column,
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
  @Column
  declare codeKey: string

  @AllowNull(false)
  @Column
  declare codeKeyId: number

  @BelongsTo(() => WasmCodeKey, 'codeKey')
  declare codeKeyIds: WasmCodeKey[]

  static async findAllWithKeyCode(): Promise<WasmCodeKeyId[]> {
    return WasmCodeKeyId.findAll({
      include: WasmCodeKey,
    })
  }
}
