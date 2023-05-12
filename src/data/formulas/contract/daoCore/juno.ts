import { ContractFormula } from '@/core'

import { instantiatedAt } from '../common'
import { config as configFormula, item } from './base'
import { memberCount as memberCountFormula } from './members'
import { allProposals } from './proposals'

type JunoHomeMetadata = {
  name?: string
  founded?: string
  image?: string
  cover?: string
  description?: string
  lastActivity?: string
  proposalCount?: number
  memberCount?: number
}

// Even though this uses the proposals, which is a dynamic formula, we only care
// about the number of proposals and the latest proposal submission date, which
// are not dynamic values. The count only ever changes when state is updated, as
// opposed to based on the current time, like the proposal status. Since we
// ignore proposal status, this is fine.
export const junoHomeMetadata: ContractFormula<JunoHomeMetadata> = {
  filter: {
    codeIdsKeys: ['dao-core'],
  },
  compute: async (env) => {
    const config = await configFormula.compute(env)
    const cover = await item.compute({
      ...env,
      args: {
        key: 'cover',
      },
    })
    const founded = await instantiatedAt.compute(env)
    const proposals = (await allProposals.compute(env)) ?? []
    const proposalCount = proposals.length
    // Get date of most recent proposal event, either completion or creation.
    const lastActivity = proposals
      .map(({ createdAt, completedAt }) =>
        completedAt
          ? new Date(completedAt)
          : createdAt
          ? new Date(createdAt)
          : null
      )
      .filter(Boolean)
      .sort()
      .pop()
      ?.toISOString()
    const memberCount = await memberCountFormula.compute(env)

    return {
      name: config?.name,
      founded,
      image: config?.image_url ?? undefined,
      description: config?.description,
      lastActivity,
      proposalCount,
      memberCount,
      cover,
    }
  },
}
