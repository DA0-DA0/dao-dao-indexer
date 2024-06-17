import { ContractFormula } from '@/types'

type VestingContract = {
  contract: string
  instantiator: string
  recipient: string
}

export const listVestingContracts: ContractFormula<
  VestingContract[],
  { limit?: string; startAfter?: string }
> = {
  compute: async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => !startAfter || key.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const listVestingContractsReverse: ContractFormula<
  VestingContract[],
  { limit?: string; startBefore?: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { limit, startBefore },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .filter(([key]) => !startBefore || key.localeCompare(startBefore) < 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const listVestingContractsByInstantiator: ContractFormula<
  VestingContract[],
  { instantiator: string; limit?: string; startAfter?: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { instantiator, limit, startAfter },
  }) => {
    if (!instantiator) {
      throw new Error('missing `instantiator`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .filter(([, value]) => value.instantiator === instantiator)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => !startAfter || key.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const listVestingContractsByInstantiatorReverse: ContractFormula<
  VestingContract[],
  { instantiator: string; limit?: string; startBefore?: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { instantiator, limit, startBefore },
  }) => {
    if (!instantiator) {
      throw new Error('missing `instantiator`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .filter(([, value]) => value.instantiator === instantiator)
      .sort(([a], [b]) => b.localeCompare(a))
      .filter(([key]) => !startBefore || key.localeCompare(startBefore) < 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const listVestingContractsByRecipient: ContractFormula<
  VestingContract[],
  { recipient: string; limit?: string; startAfter?: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { recipient, limit, startAfter },
  }) => {
    if (!recipient) {
      throw new Error('missing `recipient`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .filter(([, value]) => value.recipient === recipient)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => !startAfter || key.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const listVestingContractsByRecipientReverse: ContractFormula<
  VestingContract[],
  { recipient: string; limit?: string; startBefore?: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { recipient, limit, startBefore },
  }) => {
    if (!recipient) {
      throw new Error('missing `recipient`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const vestingContractsMap =
      (await getMap<string, VestingContract>(contractAddress, [
        'vesting_contracts',
      ])) ?? {}
    const vestingContracts = Object.entries(vestingContractsMap)
      .filter(([, value]) => value.recipient === recipient)
      .sort(([a], [b]) => b.localeCompare(a))
      .filter(([key]) => !startBefore || key.localeCompare(startBefore) < 0)
      .slice(0, limitNum)

    return vestingContracts.map(([, value]) => value)
  },
}

export const ownership: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'ownership'),
}

export const codeId: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'pci'),
}
