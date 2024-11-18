import { makeSimpleContractFormula } from '../../utils'

export const instantiator = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the instantiator/owner of the proxy contract',
  },
  key: 'owner',
})
