import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { AccountKey } from './AccountKey'

// Stores the nonce for each public key, which is used to prevent replay
// attacks of past authenticated messages.
@Table({
  timestamps: true,
})
export class Account extends Model {
  @PrimaryKey
  @Column
  publicKey!: string

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  nonce!: number

  @HasMany(() => AccountKey, 'accountPublicKey')
  keys!: AccountKey[]
}
