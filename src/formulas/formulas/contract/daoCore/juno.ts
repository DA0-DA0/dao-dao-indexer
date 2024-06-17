import { ContractFormula } from '../../../types'
import { instantiatedAt } from '../common'
import { config as configFormula, item } from './base'
import { memberCount as memberCountFormula } from './members'
import { allProposals, lastActivity as lastActivityFormula } from './proposals'

type JunoHomeMetadata = {
  name?: string
  founded?: string
  image?: string
  description?: string
  cover?: string
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
    const proposalCount = ((await allProposals.compute(env)) ?? []).length
    const lastActivity = await lastActivityFormula.compute(env)
    const memberCount = await memberCountFormula.compute(env)

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
