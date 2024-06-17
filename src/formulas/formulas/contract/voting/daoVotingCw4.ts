import { ContractFormula } from '@/types'

import * as cw4Group from '../external/cw4Group'

const CODE_IDS_KEYS = ['dao-voting-cw4']

export const votingPower: ContractFormula<string, { address: string }> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const {
      contractAddress,
      args: { address },
    } = env

    if (!address) {
      throw new Error('missing `address`')
    }

    const cw4GroupContract = await groupContract.compute(env)
    if (!cw4GroupContract) {
      throw new Error(`No group contract for ${contractAddress}`)
    }

    return BigInt(
      await cw4Group.member.compute({
        ...env,
        contractAddress: cw4GroupContract,
      })
    ).toString()
  },
}

export const totalPower: ContractFormula<string> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const cw4GroupContract = await groupContract.compute(env)
    if (!cw4GroupContract) {
      throw new Error(`No group contract for ${env.contractAddress}`)
    }

    return BigInt(
      await cw4Group.totalWeight.compute({
        ...env,
        contractAddress: cw4GroupContract,
      })
    ).toString()
  },
}

export const groupContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'groupContract'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'group_contract')),
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'daoAddress'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'dao_address')),
}
