import { ContractFormula } from '@/core'

export const votingPower: ContractFormula<string, { address: string }> = {
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
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'totalWeight'))
      ?.value || '0',
}

export const groupContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'group_contract'))
      ?.value,
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'daoAddress'))
      ?.value,
}
