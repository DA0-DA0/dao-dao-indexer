/*
    #[cosmwasm_schema::cw_serde]
    pub struct State {
        pub modules: Vec<Addr>,
    }
    pub const ANS_HOST: Item<AnsHost> = Item::new("\u{0}{6}ans_host");
    pub const STATE: Item<State> = Item::new("\u{0}{5}state");
    pub const ADMIN: Admin = Admin::new(ADMIN_NAMESPACE);
 */

import { ContractFormula } from '@/types'

import { ProxyTypes } from './types'

const ProxyStorageKeys = {
  ANS_HOST: 'ans_host',
  STATE: 'state',
  ADMIN: 'admin',
  ACCOUNT_ID: 'acc_id',
}

export const accountId: ContractFormula<ProxyTypes.AccountId | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return await get<ProxyTypes.AccountId>(
      contractAddress,
      ProxyStorageKeys.ACCOUNT_ID
    )
  },
}

type State = {
  modules: string[]
}

export const config: ContractFormula<ProxyTypes.ConfigResponse | undefined> = {
  compute: async ({ contractAddress, get }) => {
    const state = await get<State>(
      contractAddress,
      ProxyStorageKeys.STATE
    )

    return (
      state && {
        modules: state.modules,
      }
    )
  },
}
