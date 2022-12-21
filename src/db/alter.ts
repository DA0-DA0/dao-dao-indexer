import { loadDb } from './index'

export const main = async () => {
  // Log when altering.
  const sequelize = await loadDb({ logging: true })

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
