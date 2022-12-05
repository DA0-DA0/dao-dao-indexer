import { Formula } from '../types'

export const balance: Formula<string> = async ({
  contractAddress,
  get,
  args: { address },
}) =>
  // If no balance is found, return 0.
  (await get<string>(contractAddress, 'balance', address)) ?? '0'
