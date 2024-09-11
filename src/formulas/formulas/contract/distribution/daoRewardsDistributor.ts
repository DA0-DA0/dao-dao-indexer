import { ContractFormula } from '@/types'

const CODE_IDS_KEYS: string[] = ['dao-rewards-distributor']

export const distribution: ContractFormula<
  any,
  {
    id: string
  }
> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { id },
  }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const distribution = (
      await getTransformationMatch(contractAddress, `distribution:${id}`)
    )?.value

    if (!distribution) {
      throw new Error(`distribution not found for id: ${id}`)
    }

    return distribution
  },
}

export const distributions: ContractFormula<
  {
    distributions: any[]
  },
  {
    limit?: string
    startAfter?: string
  }
> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMap,
    args: { limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter ? Number(startAfter) : -1

    const map =
      (await getTransformationMap<number, any>(
        contractAddress,
        'distribution'
      )) ?? {}
    const distributions = Object.entries(map)
      // Ascending by ID.
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([id]) => Number(id) > startAfterNum)
      .slice(0, limitNum)
      .map(([, distribution]) => distribution)

    return {
      distributions,
    }
  },
}
