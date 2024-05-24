import { Op, Sequelize } from 'sequelize'

import { getEnv } from '@/core'
import { getCodeIdsForKeys } from '@/core/config'
import {
  ContractEnv,
  FormulaType,
  MeilisearchIndexUpdate,
  MeilisearchIndexer,
} from '@/core/types'
import { Contract, WasmStateEvent, WasmStateEventTransformation } from '@/db'

import { getDaoAddressForProposalModule } from '../webhooks/utils'

export const daos: MeilisearchIndexer = {
  id: 'daos',
  index: 'daos',
  automatic: true,
  filterableAttributes: [
    'value.config.name',
    'value.config.description',
    'value.proposalCount',
  ],
  sortableAttributes: ['value.proposalCount'],
  matches: async ({ event, state }) => {
    if (!(event instanceof WasmStateEvent)) {
      return
    }

    let daoAddress = event.contract?.matchesCodeIdKeys('dao-core')
      ? event.contractAddress
      : undefined

    // If not DAO, attempt to fetch DAO from proposal module. This will fail if
    // the address is not a proposal module. This is needed since the DAO dump
    // state formula includes the total proposal count which is fetched from
    // proposal modules.
    if (!daoAddress) {
      const env: ContractEnv = {
        ...getEnv({
          chainId: state.chainId,
          block: event.block,
          useBlockDate: true,
        }),
        contractAddress: event.contractAddress,
      }
      daoAddress = await getDaoAddressForProposalModule(env)
    }

    return (
      !!daoAddress && {
        id: daoAddress,
        formula: {
          type: FormulaType.Contract,
          name: 'daoCore/dumpState',
          targetAddress: daoAddress,
        },
      }
    )
  },
  getBulkUpdates: async () => {
    const codeIds = getCodeIdsForKeys('dao-core')
    if (!codeIds.length) {
      return []
    }

    const contracts = await Contract.findAll({
      where: {
        codeId: codeIds,
      },
    })

    return contracts.map(
      ({ address }): MeilisearchIndexUpdate => ({
        id: address,
        formula: {
          type: FormulaType.Contract,
          name: 'daoCore/dumpState',
          targetAddress: address,
        },
      })
    )
  },
}

export const daoProposals: MeilisearchIndexer = {
  id: 'dao-proposals',
  // Keep `proposals` for backwards compatibility reasons, even though the ID is
  // `dao-proposals`.
  index: 'proposals',
  automatic: true,
  filterableAttributes: [
    'value.id',
    'value.dao',
    'value.proposal.title',
    'value.proposal.description',
    'value.proposal.proposer',
    'value.proposal.status',
  ],
  matches: ({ event }) => {
    if (
      !(
        event instanceof WasmStateEventTransformation &&
        event.name.startsWith('proposal:') &&
        event.contract
      )
    ) {
      return
    }

    let name: string
    if (event.contract.matchesCodeIdKeys('dao-proposal-single')) {
      name = 'daoProposalSingle/proposal'
    } else if (event.contract.matchesCodeIdKeys('dao-proposal-multiple')) {
      name = 'daoProposalMultiple/proposal'
    } else {
      return
    }

    return (
      event.name.startsWith('proposal:') && {
        id: event.contractAddress + '_' + event.name.split(':')[1],
        formula: {
          type: FormulaType.Contract,
          name,
          targetAddress: event.contractAddress,
          args: {
            id: event.name.split(':')[1],
          },
        },
      }
    )
  },
  getBulkUpdates: async () => {
    const singleCodeIds = getCodeIdsForKeys('dao-proposal-single')
    const multipleCodeIds = getCodeIdsForKeys('dao-proposal-multiple')
    if (singleCodeIds.length + multipleCodeIds.length === 0) {
      return []
    }

    const events = await WasmStateEventTransformation.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the name
        // for each contract.
        Sequelize.literal(
          'DISTINCT ON("name", "contractAddress") \'\''
        ) as unknown as string,
        'id',
        'name',
        'contractAddress',
        'blockHeight',
        'blockTimeUnixMs',
        'value',
      ],
      where: {
        name: {
          [Op.like]: 'proposal:%',
        },
      },
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['name', 'ASC'],
        ['contractAddress', 'ASC'],
        // Descending block height ensures we get the most recent transformation
        // for the (contractAddress,name) pair.
        ['blockHeight', 'DESC'],
      ],
      include: [
        {
          model: Contract,
          required: true,
          where: {
            codeId: [...singleCodeIds, ...multipleCodeIds],
          },
        },
      ],
    })

    return events.map(
      ({ contractAddress, name, contract }): MeilisearchIndexUpdate => ({
        id: contractAddress + '_' + name.split(':')[1],
        formula: {
          type: FormulaType.Contract,
          name: singleCodeIds.includes(contract.codeId)
            ? 'daoProposalSingle/proposal'
            : multipleCodeIds.includes(contract.codeId)
            ? 'daoProposalMultiple/proposal'
            : // Should never happen.
              '',
          targetAddress: contractAddress,
          args: {
            id: name.split(':')[1],
          },
        },
      })
    )
  },
}
