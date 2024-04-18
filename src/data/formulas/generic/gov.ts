import { FormulaProposalObject, GenericFormula } from '@/core'

export const proposal: GenericFormula<
  FormulaProposalObject | undefined,
  { id: string }
> = {
  compute: async ({ getProposal, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    return await getProposal(id)
  },
}

export const proposals: GenericFormula<
  {
    proposals: FormulaProposalObject[]
    total: number
  },
  {
    offset?: string
    limit?: string
  }
> = {
  compute: async ({
    getProposals,
    getProposalCount,
    args: { offset, limit },
  }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort ascending.
    const proposals = (await getProposals(true, limitNum, offsetNum)) || []

    // Should be cached since all proposals were just fetched above.
    const total = await getProposalCount()

    return {
      proposals,
      total,
    }
  },
}

export const reverseProposals: GenericFormula<
  {
    proposals: FormulaProposalObject[]
    total: number
  },
  {
    offset?: string
    limit?: string
  }
> = {
  compute: async ({
    getProposals,
    getProposalCount,
    args: { offset, limit },
  }) => {
    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort descending.
    const proposals = (await getProposals(false, limitNum, offsetNum)) || []

    // Should be cached since all proposals were just fetched above.
    const total = await getProposalCount()

    return {
      proposals,
      total,
    }
  },
}
