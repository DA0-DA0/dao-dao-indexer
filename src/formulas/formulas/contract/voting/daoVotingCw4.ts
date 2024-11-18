import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'
import * as cw4Group from '../external/cw4Group'

const CODE_IDS_KEYS = ['dao-voting-cw4']

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
  docs: {
    description:
      'retrieves the voting power for an address at a specific block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'block',
        description: 'block height to get voting power at',
        required: true,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
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
  docs: {
    description:
      'retrieves the voting power for an address at the current block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  docs: {
    description: 'retrieves the total voting power at a specific block height',
    args: [
      {
        name: 'block',
        description: 'block height to get total power at',
        required: true,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
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
  docs: {
    description: 'retrieves the total voting power at the current block height',
  },
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const groupContract = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the group contract address',
  },
  transformation: 'groupContract',
  fallbackKeys: ['group_contract'],
})

export const dao = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the DAO address associated with the contract',
  },
  transformation: 'daoAddress',
  fallbackKeys: ['dao_address'],
})
