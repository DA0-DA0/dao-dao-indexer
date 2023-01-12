import { ContractFormula } from '@/core'

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    get,
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
      )?.value ||
      // Fallback to events.
      (await get<string>(contractAddress, 'user_weights', address)) ||
      '0'
    )
  },
}

export const totalPower: ContractFormula<string> = {
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
