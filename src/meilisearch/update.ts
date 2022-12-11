import { loadConfig } from '../config'
import { compute, getFormula } from '../core'
import { Contract } from '../db'
import { loadMeilisearch } from './client'

export const updateIndexesForContracts = async (contracts: Contract[]) => {
  const client = await loadMeilisearch()
  const {
    meilisearch: { indexes },
  } = await loadConfig()

  for (const {
    index,
    formula: formulaName,
    args = {},
    codeIds,
    contractAddresses,
  } of indexes) {
    const formula = getFormula(formulaName)
    if (!formula) {
      throw new Error(`Formula ${formulaName} not found`)
    }

    if (!codeIds?.length && !contractAddresses?.length) {
      throw new Error(
        'One of codeIds or contractAddresses must be present in config.meilisearch.outputs'
      )
    }

    const clientIndex = client.index(index)

    const matchingContracts = contracts.filter(
      (contract) =>
        codeIds?.includes(contract.codeId) ||
        contractAddresses?.includes(contract.address)
    )

    if (!matchingContracts.length) {
      continue
    }

    try {
      const documents = await Promise.all(
        matchingContracts.map(async (contract) => ({
          contractAddress: contract.address,
          codeId: contract.codeId,
          ...(await compute(formula, contract, args)),
        }))
      )

      await clientIndex.addDocuments(documents)
    } catch (err) {
      console.error(
        `Error computing formula ${formulaName} for contracts ${matchingContracts.map(
          (c) => c.address
        )} and adding to index ${index}:`,
        err
      )
    }
  }
}
