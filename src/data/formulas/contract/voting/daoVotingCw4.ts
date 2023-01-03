import { ContractFormula } from '@/core'

export const votingPower: ContractFormula<
  string,
  { address: string }
> = async ({ contractAddress, get, args: { address } }) => {
  if (!address) {
    throw new Error('missing `address`')
  }

  const weight = await get<string | undefined>(
    contractAddress,
    'user_weights',
    address
  )
  return weight || '0'
}

export const totalPower: ContractFormula<string> = async ({
  contractAddress,
  get,
}) => {
  const weight = await get<string | undefined>(contractAddress, 'total_weight')
  return weight || '0'
}

export const groupContract: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'group_contract')

export const dao: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao_address')
