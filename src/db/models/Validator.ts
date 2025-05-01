import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

@Table({
  timestamps: true,
})
export class Validator extends Model {
  @PrimaryKey
  @Column(DataType.STRING)
  declare operatorAddress: string
}
