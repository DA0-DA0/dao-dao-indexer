import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountWebhook } from './AccountWebhook'

@Table({
  timestamps: true,
})
export class AccountWebhookCodeIdSet extends Model {
  @ForeignKey(() => AccountWebhook)
  @Column(DataType.INTEGER)
  declare webhookId: number

  @ForeignKey(() => AccountCodeIdSet)
  @Column(DataType.INTEGER)
  declare codeIdSetId: number
}
