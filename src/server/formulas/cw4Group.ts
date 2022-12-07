import { Formula } from '../types'

interface Member {
  addr: string
  weight: string
}

export const member: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => (await get<string>(contractAddress, 'members', address)) || '0'

export const listMembers: Formula<
  Member[],
  {
    limit?: string
    startAfter?: string
  }
> = async ({ contractAddress, getMap, args: { limit = '30', startAfter } }) => {
  const membersMap =
    (await getMap<string, string>(contractAddress, 'members')) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const members = Object.entries(membersMap)
    // Ascending by address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return members.map(([addr, weight]) => ({
    addr,
    weight,
  }))
}

export const totalWeight: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string>(contractAddress, 'total')) || '0'

export const admin: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'admin')
