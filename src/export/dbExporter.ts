import { loadDb } from '../db'
import { Contract, Event } from '../db/models'
import { Exporter } from './types'

export const dbExporter: Exporter = async (events) => {
  await loadDb()

  const uniqueContracts = [
    ...new Set(events.map((event) => event.contractAddress)),
  ]

  // Ensure contract exists before creating events. `address` is unique.
  await Contract.bulkCreate(
    uniqueContracts.map((address) => ({
      address,
      codeId: events.find((event) => event.contractAddress === address)!.codeId,
    })),
    {
      ignoreDuplicates: true,
    }
  )

  const eventRecords = events.map((event) => ({
    contractAddress: event.contractAddress,
    blockHeight: event.blockHeight,
    blockTimeUnixMicro: event.blockTimeUnixMicro,
    // Convert base64 key to comma-separated list of bytes. See explanation in
    // `Event` model for more information.
    key: Buffer.from(event.key, 'base64').join(','),
    // Convert base64 value to utf-8 string, if present.
    value: event.value && Buffer.from(event.value, 'base64').toString('utf-8'),
    delete: event.delete,
  }))

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the `value`
  // and `delete` field in case event processing for a block was batched
  // separately.
  await Event.bulkCreate(eventRecords, {
    updateOnDuplicate: ['value', 'delete'],
  })

  // Return updated contracts.
  return Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })
}
