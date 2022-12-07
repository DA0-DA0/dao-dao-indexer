import { Formula } from '../../types'

export const proposalModule: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'proposal_module')

export const dao: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const config: Formula<any | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'config')

export const depositInfo: Formula<
  any | undefined,
  { proposalId: string }
> = async ({ contractAddress, get, args: { proposalId } }) => {
  const data = await get<[any, string]>(
    contractAddress,
    'deposits',
    Number(proposalId)
  )

  if (!data || !Array.isArray(data) || data.length !== 2) {
    return
  }

  return {
    deposit_info: data[0],
    proposer: data[1],
  }
}
