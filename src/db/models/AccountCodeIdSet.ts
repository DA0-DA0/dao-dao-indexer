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
  @Column
  accountPublicKey!: string

  @BelongsTo(() => Account)
  account!: Account

  @AllowNull(false)
  @Column(DataType.STRING)
  name!: string

  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.INTEGER))
  codeIds!: number[]

  public get apiJson(): AccountCodeIdSetApiJson {
    return {
      id: this.id,
      name: this.name,
      codeIds: this.codeIds,
    }
  }
}
