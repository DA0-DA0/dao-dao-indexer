import { ContractFormula } from '@/core'

const CODE_IDS_KEYS = ['dao-voting-cw4']

export const votingPower: ContractFormula<string, { address: string }> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },

  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (
      (
        await getTransformationMatch<string>(
          contractAddress,
          `userWeight:${address}`
        )
      )?.value || '0'
    )
  },
}

export const totalPower: ContractFormula<string> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },

  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'totalWeight'))
      ?.value ||
    // Fallback to events.
    (await get<string>(contractAddress, 'total_weight')) ||
    '0',
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
