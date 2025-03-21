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

export const delegationModule = makeSimpleContractFormula<string | null>({
  docs: {
    description: 'retrieves the address of the delegation module, if any',
  },
  transformation: 'delegationModule',
  fallbackKeys: ['delegation_module'],
  fallback: null,
})
