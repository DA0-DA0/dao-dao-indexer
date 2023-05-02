import { Op } from 'sequelize'

import { FormulaType, compute, loadConfig, serializeBlock } from '@/core'
import { getContractFormula } from '@/data'
import { Contract, State } from '@/db'

import { loadMeilisearch } from './client'

type UpdateIndexesForContractsOptions = {
  contracts?: Contract[]
  mode?: 'automatic' | 'manual'
  index?: string
}

export const updateIndexesForContracts = async ({
  contracts,
  mode = 'automatic',
  index: filterIndex,
}: UpdateIndexesForContractsOptions = {}): Promise<number> => {
  const config = loadConfig()

  // If no meilisearch in config, nothing to update.
  if (!config.meilisearch) {
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
    automatic = true,
    formula: formulaName,
    args = {},
    codeIdsKeys,
    contractAddresses,
  } of config.meilisearch.indexes) {
    // If filter index is provided and does not match, skip.
    if (filterIndex && filterIndex !== index) {
      continue
    }

    // If not automatic, skip.
    if (!automatic && mode === 'automatic') {
      continue
    }

    const formula = getContractFormula(formulaName)
    if (!formula) {
      throw new Error(`Formula ${formulaName} not found`)
    }

    const codeIds = codeIdsKeys?.flatMap((key) => config.codeIds?.[key] ?? [])

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
      let documents = []
      // Compute formulas in batches of 100.
      for (let i = 0; i < matchingContracts.length; i += 100) {
        documents.push(
          ...(await Promise.all(
            matchingContracts.slice(i, i + 100).map(async (contract) => {
              const { block, value } = await compute({
                name: formulaName,
                type: FormulaType.Contract,
                targetAddress: contract.address,
                formula,
                args,
                block: state.latestBlock,
              })

              return {
                contractAddress: contract.address,
                codeId: contract.codeId,
                block: block && serializeBlock(block),
                value,
              }
            })
          ))
        )

        console.log(
          `[${index}] Finished computing ${documents.length.toLocaleString()}/${matchingContracts.length.toLocaleString()} formulas...`
        )
      }

      await clientIndex.addDocuments(documents)

      exported += documents.length
    } catch (err) {
      console.error(
        `Error computing formula ${formulaName} and adding to index ${index}:`,
        err
      )
    }
  }

  return exported
}
