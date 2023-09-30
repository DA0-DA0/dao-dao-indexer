import { QueryInterface } from 'sequelize'

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.changeColumn('BankStateEvents', 'balance', {
      type: 'text',
      allowNull: false,
    })
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.changeColumn('BankStateEvents', 'balance', {
      type: 'bigint',
      allowNull: false,
    })
  },
}
