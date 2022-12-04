import { loadDb } from './index'

export const main = async () => {
  const sequelize = await loadDb()

  try {
    // Alter the database to match any changes.
    await sequelize.sync({ alter: true })
    console.log('Altered.')
  } catch (err) {
    console.error(err)
  }

  await sequelize.close()
}

main()
