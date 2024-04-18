import { Sequelize } from 'sequelize'

import {
  FormulaType,
  MeilisearchIndexUpdate,
  MeilisearchIndexer,
} from '@/core/types'
import { GovStateEvent } from '@/db'

export const govProposals: MeilisearchIndexer = {
  id: 'gov-proposals',
  index: 'gov_proposals',
  automatic: true,
  filterableAttributes: ['value.id', 'value.title', 'value.description'],
  matches: ({ event }) => {
    if (!(event instanceof GovStateEvent)) {
      return
    }

    return {
      id: event.proposalId,
      formula: {
        type: FormulaType.Generic,
        name: 'gov/decodedProposal',
        targetAddress: '_',
        args: {
          id: event.proposalId,
        },
      },
    }
  },
  getBulkUpdates: async () => {
    const events = await GovStateEvent.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the name
        // for each contract.
        Sequelize.literal(
          'DISTINCT ON("proposalId") \'\''
        ) as unknown as string,
        'proposalId',
      ],
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['proposalId', 'ASC'],
      ],
    })

    return events.map(
      ({ proposalId }): MeilisearchIndexUpdate => ({
        id: proposalId,
        formula: {
          type: FormulaType.Generic,
          name: 'gov/decodedProposal',
          targetAddress: '_',
          args: {
            id: proposalId,
          },
        },
      })
    )
  },
}
