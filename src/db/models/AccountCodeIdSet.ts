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
  name: string
  codeIds: string[]
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
  @Column(DataType.ARRAY(DataType.BIGINT))
  codeIds!: string[]

  public async getApiJson(): Promise<AccountCodeIdSetApiJson> {
    return {
      name: this.name,
      codeIds: this.codeIds,
    }
  }
}
