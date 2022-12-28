import { Op } from 'sequelize'

import { loadConfig } from '../config'
import { computeContract, getContractFormula } from '../core'
import { Contract, State } from '../db'
import { loadMeilisearch } from './client'

export const updateIndexesForContracts = async (
  contracts?: Contract[]
): Promise<number> => {
  const { meilisearch } = await loadConfig()

  // If no meilisearch in config, nothing to update.
  if (!meilisearch) {
    return 0
  }

  const client = await loadMeilisearch()

  // Update indexes with data from the latest block height.
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while updating indexes')
  }

  let exported = 0

  for (const {
    index,
    formula: formulaName,
    args = {},
    codeIds,
    contractAddresses,
  } of meilisearch.indexes) {
    const formula = getContractFormula(formulaName)
    if (!formula) {
      throw new Error(`Formula ${formulaName} not found`)
    }

    if (!codeIds?.length && !contractAddresses?.length) {
      throw new Error(
        'One of codeIds or contractAddresses must be present in config.meilisearch.outputs'
      )
    }

    const clientIndex = client.index(index)

    const matchingContracts =
      contracts?.filter(
        (contract) =>
          codeIds?.includes(contract.codeId) ||
          contractAddresses?.includes(contract.address)
      ) ??
      // If no contracts provided, query for all matching contracts.
      (await Contract.findAll({
        where:
          codeIds && contractAddresses
            ? {
                [Op.or]: {
                  codeId: codeIds,
                  address: contractAddresses,
                },
              }
            : codeIds
            ? {
                codeId: codeIds,
              }
            : {
                address: contractAddresses,
              },
      }))

    if (!matchingContracts.length) {
      continue
    }

    try {
      const documents = await Promise.all(
        matchingContracts.map(async (contract) => {
          const { block, value } = await computeContract(
            formula,
            contract,
            args,
            state.latestBlock
          )

          return {
            contractAddress: contract.address,
            codeId: contract.codeId,
            block,
            value,
          }
        })
      )

      await clientIndex.addDocuments(documents)

      exported += documents.length
    } catch (err) {
      console.error(
        `Error computing formula ${formulaName} for contracts ${matchingContracts.map(
          (c) => c.address
        )} and adding to index ${index}:`,
        err
      )
    }
  }

  return exported
}
