import { Sequelize, SequelizeOptions } from 'sequelize-typescript'

import { ExporterMaker } from '../types'
import { Contract, Event } from './models'

export const makeExporter: ExporterMaker = async ({ db }) => {
  const options: SequelizeOptions = {
    // Allow options to override logging, but default to false.
    logging: false,

    // User config.
    ...db,

    // Tell Sequelize what models we have.
    models: [Contract, Event],
  }

  // If URI present, use it. Otherwise, use options directly.
  const sequelize = db.uri
    ? new Sequelize(db.uri, options)
    : new Sequelize(options)

  try {
    await sequelize.authenticate()
    console.log('Connection has been established successfully.')
  } catch (error) {
    console.error('Unable to connect to the database:', error)
  }

  // Alter the database to match the model classes we defined.
  try {
    await sequelize.sync({ alter: true })
  } catch (error) {
    console.error('Unable to sync database:', error)
  }

  // Exporter function.
  return async (event) => {
    // Ensure contract exists before creating event.
    await Contract.findOrCreate({
      where: { address: event.contractAddress },
      defaults: { codeId: event.codeId },
    })

    // Create event only if [contractAddress, blockHeight, key] is unique.
    const [, created] = await Event.findOrCreate({
      where: {
        contractAddress: event.contractAddress,
        blockHeight: event.blockHeight,
        key: event.key,
      },
      defaults: {
        blockTimeUnixMs: event.blockTimeUnixMs,
        value: event.value,
        delete: event.delete,
      },
    })

    return created
  }
}
