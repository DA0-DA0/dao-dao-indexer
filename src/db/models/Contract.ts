import {
  AllowNull,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { Event } from './Event'

@Table({
  timestamps: true,
})
export class Contract extends Model {
  @PrimaryKey
  @Column
  address: string

  @AllowNull(false)
  @Column(DataType.BIGINT({ unsigned: true }))
  codeId: bigint
}
