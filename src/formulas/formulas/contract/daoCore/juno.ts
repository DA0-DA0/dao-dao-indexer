import { ContractFormula } from '@/types'

import { instantiatedAt } from '../common'
import { config as configFormula, item } from './base'
import { memberCount as memberCountFormula } from './members'
import { allProposals, lastActivity as lastActivityFormula } from './proposals'

type JunoHomeMetadata = {
  name?: string
  founded?: string
  image?: string
  description?: string
  cover?: string | null
  lastActivity?: string | null
  proposalCount?: number
  memberCount?: number
}

// Even though this uses the proposals, which is a dynamic formula, we only care
// about the number of proposals and the latest proposal submission date, which
// are not dynamic values. The count only ever changes when state is updated, as
// opposed to based on the current time, like the proposal status. Since we
// ignore proposal status, this is fine.
export const junoHomeMetadata: ContractFormula<JunoHomeMetadata> = {
  docs: {
    description: 'retrieves specific DAO metadata for the Juno website',
  },
  filter: {
    codeIdsKeys: ['dao-core'],
  },
  compute: async (env) => {
    const [config, cover, founded, proposalCount, lastActivity, memberCount] =
      await Promise.all([
        configFormula.compute(env).catch(() => undefined),
        item
          .compute({
            ...env,
            args: {
              key: 'cover',
            },
          })
          .catch(() => undefined),
        instantiatedAt.compute(env).catch(() => undefined),
        allProposals
          .compute(env)
          .then((proposals) => proposals?.length || 0)
          .catch(() => undefined),
        lastActivityFormula.compute(env).catch(() => undefined),
        memberCountFormula.compute(env).catch(() => undefined),
      ])

    return {
      name: config?.name,
      founded,
      image: config?.image_url ?? undefined,
      description: config?.description,
      cover,
      lastActivity,
      proposalCount,
      memberCount,
    }
  },
}
