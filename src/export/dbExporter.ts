import { loadDb } from '../db'
import { Contract, Event } from '../db/models'
import { ExporterMaker } from './types'

export const makeDbExporter: ExporterMaker = async ({ db }) => {
  await loadDb(db)

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
        blockTimeUnixMicro: event.blockTimeUnixMs,
        value: event.value,
        delete: event.delete,
      },
    })

    return created
  }
}
