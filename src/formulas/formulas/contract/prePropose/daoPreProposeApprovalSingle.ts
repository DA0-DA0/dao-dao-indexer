import { ContractEnv, ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

export * from './daoPreProposeBase'

type ProposalStatus =
  | {
      pending: {}
    }
  | {
      approved: {
        created_proposal_id: number
      }
    }
  | {
      rejected: {}
    }

type Proposal = {
  status: ProposalStatus
  approval_id: number
  proposer: string
  msg: any
  deposit: any
  // Extra.
  createdAt?: string
  completedAt?: string
}

export const approver = makeSimpleContractFormula<string>({
  key: 'approver',
})

export const proposalCreatedAt: ContractFormula<string, { id: string }> = {
  compute: async ({
    contractAddress,
    getDateFirstTransformed,
    getDateKeyFirstSet,
    args: { id },
  }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const date = (
      (await getDateFirstTransformed(
        contractAddress,
        `pendingProposal:${id}`
      )) ??
      // Fallback to events.
      (await getDateKeyFirstSet(
        contractAddress,
        'pending_proposals',
        Number(id)
      ))
    )?.toISOString()

    if (!date) {
      throw new Error('failed to load proposal creation date')
    }

    return date
  },
}

export const proposalCompletedAt: ContractFormula<string, { id: string }> = {
  compute: async ({
    contractAddress,
    getDateFirstTransformed,
    getDateKeyFirstSet,
    args: { id },
  }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const date = (
      (await getDateFirstTransformed(
        contractAddress,
        `completedProposal:${id}`
      )) ??
      // Fallback to events.
      (await getDateKeyFirstSet(
        contractAddress,
        'completed_proposals',
        Number(id)
      ))
    )?.toISOString()

    if (!date) {
      throw new Error('failed to load proposal completion date')
    }

    return date
  },
}

export const proposal: ContractFormula<Proposal, { id: string }> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMatch,
      get,
      args: { id },
    } = env

    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const idNum = Number(id)
    let proposal =
      (
        await getTransformationMatch<Proposal>(
          contractAddress,
          `completedProposal:${id}`
        )
      )?.value ||
      (
        await getTransformationMatch<Proposal>(
          contractAddress,
          `pendingProposal:${id}`
        )
      )?.value ||
      (await get<Proposal>(contractAddress, 'completed_proposals', idNum)) ||
      (await get<Proposal>(contractAddress, 'pending_proposals', idNum))

    if (!proposal) {
      throw new Error('proposal not found')
    }

    return await withMetadata(env, proposal)
  },
}

export const pendingProposals: ContractFormula<
  Proposal[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      getMap,
      args: { limit, startAfter },
    } = env

    const pendingProposals =
      (await getTransformationMap<number, Proposal>(
        contractAddress,
        'pendingProposal'
      )) ||
      (await getMap<number, Proposal>(contractAddress, 'pending_proposals', {
        keyType: 'number',
      }))

    if (!pendingProposals) {
      return []
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter
      ? Math.max(0, Number(startAfter))
      : -Infinity

    const proposalIds = Object.keys(pendingProposals)
      .map(Number)
      // Ascending by proposal ID.
      .sort((a, b) => a - b)
      .filter((id) => id > startAfterNum)
      .slice(0, limitNum)

    return await Promise.all(
      proposalIds.map((id) => withMetadata(env, pendingProposals[id]))
    )
  },
}

export const reversePendingProposals: ContractFormula<
  Proposal[],
  {
    limit?: string
    startBefore?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      getMap,
      args: { limit, startBefore },
    } = env

    const pendingProposals =
      (await getTransformationMap<number, Proposal>(
        contractAddress,
        'pendingProposal'
      )) ||
      (await getMap<number, Proposal>(contractAddress, 'pending_proposals', {
        keyType: 'number',
      }))

    if (!pendingProposals) {
      return []
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startBeforeNum = startBefore
      ? Math.max(0, Number(startBefore))
      : Infinity

    const proposalIds = Object.keys(pendingProposals)
      .map(Number)
      // Descending by proposal ID.
      .sort((a, b) => b - a)
      .filter((id) => id < startBeforeNum)
      .slice(0, limitNum)

    return await Promise.all(
      proposalIds.map((id) => withMetadata(env, pendingProposals[id]))
    )
  },
}

export const completedProposals: ContractFormula<
  Proposal[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      getMap,
      args: { limit, startAfter },
    } = env

    const completedProposals =
      (await getTransformationMap<number, Proposal>(
        contractAddress,
        'completedProposal'
      )) ||
      (await getMap<number, Proposal>(contractAddress, 'completed_proposals', {
        keyType: 'number',
      }))

    if (!completedProposals) {
      return []
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter
      ? Math.max(0, Number(startAfter))
      : -Infinity

    const proposalIds = Object.keys(completedProposals)
      .map(Number)
      // Ascending by proposal ID.
      .sort((a, b) => a - b)
      .filter((id) => id > startAfterNum)
      .slice(0, limitNum)

    return await Promise.all(
      proposalIds.map((id) => withMetadata(env, completedProposals[id]))
    )
  },
}

export const reverseCompletedProposals: ContractFormula<
  Proposal[],
  {
    limit?: string
    startBefore?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      getMap,
      args: { limit, startBefore },
    } = env

    const completedProposals =
      (await getTransformationMap<number, Proposal>(
        contractAddress,
        'completedProposal'
      )) ||
      (await getMap<number, Proposal>(contractAddress, 'completed_proposals', {
        keyType: 'number',
      }))

    if (!completedProposals) {
      return []
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startBeforeNum = startBefore
      ? Math.max(0, Number(startBefore))
      : Infinity

    const proposalIds = Object.keys(completedProposals)
      .map(Number)
      // Descending by proposal ID.
      .sort((a, b) => b - a)
      .filter((id) => id < startBeforeNum)
      .slice(0, limitNum)

    return await Promise.all(
      proposalIds.map((id) => withMetadata(env, completedProposals[id]))
    )
  },
}

export const completedProposalIdForCreatedProposalId: ContractFormula<
  number,
  {
    id: string
  }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    get,
    args: { id },
  }) => {
    if (!id || isNaN(Number(id)) || Number(id) < 0) {
      throw new Error('missing `id`')
    }

    const proposalId =
      (
        await getTransformationMatch<number>(
          contractAddress,
          `createdToCompletedProposal:${id}`
        )
      )?.value ||
      // Fallback to events.
      (await get<number>(
        contractAddress,
        'created_to_completed_proposal',
        Number(id)
      ))

    if (typeof proposalId !== 'number') {
      throw new Error('failed to get proposal ID')
    }

    return proposalId
  },
}

// Helpers

const withMetadata = async (
  env: ContractEnv,
  proposal: Proposal
): Promise<Proposal> => {
  const [createdAt, completedAt] = await Promise.all([
    proposalCreatedAt.compute({
      ...env,
      args: {
        id: proposal.approval_id.toString(),
      },
    }),
    proposalCompletedAt.compute({
      ...env,
      args: {
        id: proposal.approval_id.toString(),
      },
    }),
  ])

  return {
    ...proposal,
    // Extra.
    createdAt,
    completedAt,
  }
}
