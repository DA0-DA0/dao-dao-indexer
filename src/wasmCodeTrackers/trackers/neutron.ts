import { WasmCodeTracker } from '@/types'

export const neutronDaoDaoCore: WasmCodeTracker = {
  chainId: 'neutron-1',
  codeKey: 'dao-core',
  contractAddresses: new Set([
    'neutron1suhgf5svhu4usrurvxzlgn54ksxmn8gljarjtxqnapv8kjnp4nrstdxvff',
  ]),
}

export const neutronDaoProposalSingle: WasmCodeTracker = {
  chainId: 'neutron-1',
  codeKey: 'dao-proposal-single',
  contractAddresses: new Set([
    'neutron1436kxs0w2es6xlqpp9rd35e3d0cjnw4sv8j3a7483sgks29jqwgshlt6zh',
    'neutron12pwnhtv7yat2s30xuf4gdk9qm85v4j3e6p44let47pdffpklcxlq56v0te',
  ]),
}

export const neutronDaoProposalMultiple: WasmCodeTracker = {
  chainId: 'neutron-1',
  codeKey: 'dao-proposal-multiple',
  contractAddresses: new Set([
    'neutron1pvrwmjuusn9wh34j7y520g8gumuy9xtl3gvprlljfdpwju3x7ucsj3fj40',
  ]),
}
