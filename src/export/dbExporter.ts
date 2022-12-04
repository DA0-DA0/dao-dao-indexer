import { loadDb } from '../db'
import { Contract, Event } from '../db/models'
import { Exporter } from './types'

export const dbExporter: Exporter = async (event) => {
  await loadDb()

  // Ensure contract exists before creating event.
  await Contract.findOrCreate({
    where: { address: event.contractAddress },
    defaults: { codeId: event.codeId },
  })

  // Convert base64 key to comma-separated list of bytes. See explanation in
  // `Event` model for more information.
  const key = Buffer.from(event.key, 'base64').join(',')
  // Convert base64 value to utf-8 string, if present.
  const value =
    event.value && Buffer.from(event.value, 'base64').toString('utf-8')

  // Create event only if [contractAddress, blockHeight, key] is unique.
  const [, created] = await Event.findOrCreate({
    where: {
      contractAddress: event.contractAddress,
      blockHeight: event.blockHeight,
      key,
    },
    defaults: {
      blockTimeUnixMicro: event.blockTimeUnixMicro,
      value,
      delete: event.delete,
    },
  })

  return created
}
