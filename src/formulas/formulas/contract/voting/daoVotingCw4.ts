import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'
import * as cw4Group from '../external/cw4Group'

const CODE_IDS_KEYS = ['dao-voting-cw4']

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const {
      contractAddress,
      args: { address },
      block,
    } = env

    if (!address) {
      throw new Error('missing `address`')
    }

    const cw4GroupContract = await groupContract.compute(env)
    if (!cw4GroupContract) {
      throw new Error(`No group contract for ${contractAddress}`)
    }

    const power = BigInt(
      await cw4Group.member.compute({
        ...env,
        contractAddress: cw4GroupContract,
      })
    ).toString()

    return {
      power,
      height: Number(block.height),
    }
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const cw4GroupContract = await groupContract.compute(env)
    if (!cw4GroupContract) {
      throw new Error(`No group contract for ${env.contractAddress}`)
    }

    const power = BigInt(
      await cw4Group.totalWeight.compute({
        ...env,
        contractAddress: cw4GroupContract,
      })
    ).toString()

    return {
      power,
      height: Number(env.block.height),
    }
  },
}

export const totalPower: ContractFormula<string> = {
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const groupContract = makeSimpleContractFormula<string>({
  transformation: 'groupContract',
  fallbackKeys: ['group_contract'],
})

export const dao = makeSimpleContractFormula<string>({
  transformation: 'daoAddress',
  fallbackKeys: ['dao_address'],
})
