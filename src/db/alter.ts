import { loadDb } from './index'

export const main = async () => {
  const sequelize = await loadDb()
  // Alter the database to match any changes.
  await sequelize.sync({ alter: true })
  console.log('Altered.')

  await sequelize.close()
}

main()
