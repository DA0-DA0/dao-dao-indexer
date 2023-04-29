import { ContractFormula } from '@/core'

export const result: ContractFormula<
  any,
  { initiator: string; initiatorMsg: string }
> = {
  compute: async ({
    contractAddress,
    get,
    args: { initiator, initiatorMsg },
  }) => {
    if (!initiator) {
      throw new Error('Missing initiator')
    }
    if (!initiatorMsg) {
      throw new Error('Missing initiatorMsg')
    }

    return await get<string>(
      contractAddress,
      'results',
      initiator,
      initiatorMsg
    )
  },
}
