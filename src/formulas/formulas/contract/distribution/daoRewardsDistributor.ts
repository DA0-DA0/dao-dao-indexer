import { ContractFormula } from '@/types'

const CODE_IDS_KEYS: string[] = ['dao-rewards-distributor']

export const distribution: ContractFormula<
  any,
  {
    id: string
  }
> = {
  docs: {
    description: 'retrieves a distribution',
    args: [
      {
        name: 'id',
        description: 'ID of the distribution to retrieve',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
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
  docs: {
    description: 'retrieves a list of distributions',
    args: [
      {
        name: 'limit',
        description: 'maximum number of distributions to return',
        required: false,
        schema: {
          type: 'integer',
        },
      },
      {
        name: 'startAfter',
        description: 'ID to start listing distributions after',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
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
      (await getTransformationMap(contractAddress, 'distribution')) ?? {}
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
