import { updateComputationValidityDependentOnChanges } from '../db'
import { Contract, Event, State } from '../db/models'
import { Transformation } from '../db/models/Transformation'
import { Exporter } from './types'

export const exporter: Exporter = async (parsedEvents) => {
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while exporting')
  }

  const uniqueContracts = [
    ...new Set(parsedEvents.map((event) => event.contractAddress)),
  ]

  // Ensure contract exists before creating events. `address` is unique.
  await Contract.bulkCreate(
    uniqueContracts.map((address) => ({
      address,
      codeId: parsedEvents.find((event) => event.contractAddress === address)!
        .codeId,
    })),
    {
      ignoreDuplicates: true,
    }
  )

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  const exportedEvents = await Event.bulkCreate(parsedEvents, {
    updateOnDuplicate: ['value', 'valueJson', 'delete'],
  })

  // Transform events as needed.
  const transformations = await Transformation.transformEvents(parsedEvents)

  const { updated, destroyed } =
    await updateComputationValidityDependentOnChanges(
      exportedEvents,
      transformations
    )

  // Get updated contracts.
  const contracts = await Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })

  return {
    contracts,
    computationsUpdated: updated,
    computationsDestroyed: destroyed,
    transformations: transformations.length,
  }
}
