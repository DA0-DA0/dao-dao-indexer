import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

export const note = makeSimpleContractFormula<string>({
  key: 'note',
})

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

    return (
      (await get<string>(
        contractAddress,
        'results',
        initiator,
        initiatorMsg
      )) ??
      // Return null if no result found.
      null
    )
  },
}
