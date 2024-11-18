import { makeSimpleContractFormula } from '../../utils'
import { ProposalCreationPolicy } from './types'

export const creationPolicy = makeSimpleContractFormula<ProposalCreationPolicy>(
  {
    docs: {
      description: 'retrieves the proposal creation policy',
    },
    key: 'creation_policy',
  }
)
