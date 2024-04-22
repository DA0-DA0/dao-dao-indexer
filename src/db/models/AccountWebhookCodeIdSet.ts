import { Column, ForeignKey, Model, Table } from 'sequelize-typescript'

import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountWebhook } from './AccountWebhook'

@Table({
  timestamps: true,
})
export class AccountWebhookCodeIdSet extends Model {
  @ForeignKey(() => AccountWebhook)
  @Column
  declare webhookId: number

  @ForeignKey(() => AccountCodeIdSet)
  @Column
  declare codeIdSetId: number
}
