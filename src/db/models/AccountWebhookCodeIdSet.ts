import { Column, ForeignKey, Model, Table } from 'sequelize-typescript'

import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountWebhook } from './AccountWebhook'

@Table({
  timestamps: true,
})
export class AccountWebhookCodeIdSet extends Model {
  @ForeignKey(() => AccountWebhook)
  @Column
  webhookId!: number

  @ForeignKey(() => AccountCodeIdSet)
  @Column
  codeIdSetId!: number
}
