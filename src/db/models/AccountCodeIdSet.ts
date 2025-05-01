import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Account } from './Account'

export type AccountCodeIdSetApiJson = {
  id: number
  name: string
  codeIds: number[]
}

@Table({
  timestamps: true,
})
export class AccountCodeIdSet extends Model {
  @AllowNull(false)
  @ForeignKey(() => Account)
  @Column(DataType.STRING)
  declare accountPublicKey: string

  @BelongsTo(() => Account)
  declare account: Account

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string

  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.INTEGER))
  declare codeIds: number[]

  public get apiJson(): AccountCodeIdSetApiJson {
    return {
      id: this.id,
      name: this.name,
      codeIds: this.codeIds,
    }
  }
}
