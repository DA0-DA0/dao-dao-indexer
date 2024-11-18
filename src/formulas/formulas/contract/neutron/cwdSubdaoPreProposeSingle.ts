import { makeSimpleContractFormula } from '../../utils'

export * from '../prePropose/daoPreProposeBase'

export const timelockAddress = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the timelock contract address',
  },
  key: 'timelock_contract_address',
})
