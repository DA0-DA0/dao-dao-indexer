import {
  FormulaDecodedProposalObject,
  FormulaDecodedProposalVoteObject,
  FormulaProposalObject,
  FormulaProposalVoteObject,
  GenericFormula,
} from '@/types'
import { decodeGovProposal, decodeGovProposalVote } from '@/utils'

export const proposal: GenericFormula<FormulaProposalObject, { id: string }> = {
  docs: {
    description: 'retrieves a chain governance proposal',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal to retrieve',
        required: true,
      },
    ],
  },
  compute: async ({ getProposal, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const proposal = await getProposal(id)

    if (!proposal) {
      throw new Error('proposal not found')
    }

    return proposal
  },
}

export const decodedProposal: GenericFormula<
  FormulaDecodedProposalObject,
  { id: string }
> = {
  docs: {
    description: 'retrieves and decodes a chain governance proposal',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal to retrieve and decode',
        required: true,
      },
    ],
  },
  compute: async ({ getProposal, args: { id } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const proposal = await getProposal(id)
    if (!proposal) {
      throw new Error('proposal not found')
    }

    const {
      proposal: decoded,
      title,
      description,
      status,
    } = decodeGovProposal(proposal.data)

    return {
      id: Number(proposal.id),
      data: proposal.data,
      title,
      description,
      status,
      submitTime: decoded?.submitTime?.getTime(),
      depositEndTime: decoded?.depositEndTime?.getTime(),
      votingStartTime: decoded?.votingStartTime?.getTime(),
      votingEndTime: decoded?.votingEndTime?.getTime(),
    }
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
  docs: {
    description:
      'retrieves a list of chain governance proposals in ascending order',
    args: [
      {
        name: 'offset',
        description: 'number of proposals to skip',
        required: false,
      },
      {
        name: 'limit',
        description: 'maximum number of proposals to return',
        required: false,
      },
    ],
  },
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
  docs: {
    description:
      'retrieves a list of chain governance proposals in descending order',
    args: [
      {
        name: 'offset',
        description: 'number of proposals to skip',
        required: false,
      },
      {
        name: 'limit',
        description: 'maximum number of proposals to return',
        required: false,
      },
    ],
  },
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

export const vote: GenericFormula<
  FormulaProposalVoteObject,
  {
    id: string
    voter: string
  }
> = {
  docs: {
    description:
      'retrieves a vote for a specific chain governance proposal and voter',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal',
        required: true,
      },
      {
        name: 'voter',
        description: 'address of the voter',
        required: true,
      },
    ],
  },
  compute: async ({ getProposalVote, args: { id, voter } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }
    if (!voter) {
      throw new Error('missing `voter`')
    }

    const vote = await getProposalVote(id, voter)

    if (!vote) {
      throw new Error('vote not found')
    }

    return vote
  },
}

export const decodedVote: GenericFormula<
  FormulaDecodedProposalVoteObject,
  {
    id: string
    voter: string
  }
> = {
  docs: {
    description:
      'retrieves and decodes a vote for a specific chain governance proposal and voter',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal',
        required: true,
      },
      {
        name: 'voter',
        description: 'address of the voter',
        required: true,
      },
    ],
  },
  compute: async ({ getProposalVote, args: { id, voter } }) => {
    if (!id) {
      throw new Error('missing `id`')
    }
    if (!voter) {
      throw new Error('missing `voter`')
    }

    const vote = await getProposalVote(id, voter)
    if (!vote) {
      throw new Error('vote not found')
    }

    const decoded = decodeGovProposalVote(vote.data)

    return {
      id: Number(id),
      voter,
      data: vote.data,
      vote:
        decoded?.options.length === 1 ? decoded.options[0].option : undefined,
      weightedOptions: decoded?.options || [],
      metadata: decoded && 'metadata' in decoded ? decoded.metadata : undefined,
    }
  },
}

export const votes: GenericFormula<
  {
    votes: FormulaProposalVoteObject[]
    total: number
  },
  {
    id: string
    offset?: string
    limit?: string
  }
> = {
  docs: {
    description:
      'retrieves a list of votes for a specific chain governance proposal in ascending order',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal',
        required: true,
      },
      {
        name: 'offset',
        description: 'number of votes to skip',
        required: false,
      },
      {
        name: 'limit',
        description: 'maximum number of votes to return',
        required: false,
      },
    ],
  },
  compute: async ({
    getProposalVotes,
    getProposalVoteCount,
    args: { id, offset, limit },
  }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort ascending.
    const votes = (await getProposalVotes(id, true, limitNum, offsetNum)) || []

    // Should be cached since all votes were just fetched above.
    const total = await getProposalVoteCount(id)

    return {
      votes,
      total,
    }
  },
}

export const reverseVotes: GenericFormula<
  {
    votes: FormulaProposalVoteObject[]
    total: number
  },
  {
    id: string
    offset?: string
    limit?: string
  }
> = {
  docs: {
    description:
      'retrieves a list of votes for a specific chain governance proposal in descending order',
    args: [
      {
        name: 'id',
        description: 'ID of the proposal',
        required: true,
      },
      {
        name: 'offset',
        description: 'number of votes to skip',
        required: false,
      },
      {
        name: 'limit',
        description: 'maximum number of votes to return',
        required: false,
      },
    ],
  },
  compute: async ({
    getProposalVotes,
    getProposalVoteCount,
    args: { id, offset, limit },
  }) => {
    if (!id) {
      throw new Error('missing `id`')
    }

    const offsetNum = offset ? Math.max(0, Number(offset)) : 0
    const limitNum = limit ? Math.max(0, Number(limit)) : undefined

    if (isNaN(offsetNum)) {
      throw new Error('invalid `offset`')
    }
    if (limitNum !== undefined && isNaN(limitNum)) {
      throw new Error('invalid `limit`')
    }

    // Sort descending.
    const votes = (await getProposalVotes(id, false, limitNum, offsetNum)) || []

    // Should be cached since all proposals were just fetched above.
    const total = await getProposalVoteCount(id)

    return {
      votes,
      total,
    }
  },
}
