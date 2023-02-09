import { ContractEnv } from '@/core'

import { dao as daoProposalMultipleDao } from '../formulas/contract/proposal/daoProposalMultiple'
import { dao as daoProposalSingleDao } from '../formulas/contract/proposal/daoProposalSingle'

const CODE_IDS_KEY_SINGLE = 'dao-proposal-single'
const CODE_IDS_KEY_MULTIPLE = 'dao-proposal-multiple'

export const getDaoAddressForProposalModule = async (
  env: ContractEnv
): Promise<string | undefined> => {
  let daoAddress: string | undefined

  // dao-proposal-single
  if (
    await env.contractMatchesCodeIdKeys(
      env.contractAddress,
      CODE_IDS_KEY_SINGLE
    )
  ) {
    daoAddress = await daoProposalSingleDao.compute(env)
  }
  // dao-proposal-multiple
  else if (
    await env.contractMatchesCodeIdKeys(
      env.contractAddress,
      CODE_IDS_KEY_MULTIPLE
    )
  ) {
    daoAddress = await daoProposalMultipleDao.compute(env)
  }

  return daoAddress
}
