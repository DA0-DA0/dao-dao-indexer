import { makeSimpleContractFormula } from '../../utils'
import { ProposalCreationPolicy } from './types'

export const creationPolicy = makeSimpleContractFormula<ProposalCreationPolicy>(
  {
    key: 'creation_policy',
  }
)
