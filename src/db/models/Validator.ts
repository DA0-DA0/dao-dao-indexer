import { Column, Model, PrimaryKey, Table } from 'sequelize-typescript'

@Table({
  timestamps: true,
})
export class Validator extends Model {
  @PrimaryKey
  @Column
  operatorAddress!: string
}
