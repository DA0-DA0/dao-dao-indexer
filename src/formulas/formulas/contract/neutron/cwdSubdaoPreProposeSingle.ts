import { makeSimpleContractFormula } from '../../utils'

export * from '../prePropose/daoPreProposeBase'

export const timelockAddress = makeSimpleContractFormula<string>({
  key: 'timelock_contract_address',
})
