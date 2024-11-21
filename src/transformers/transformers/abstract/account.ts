import { makeTransformer, makeTransformerForMap } from '@/transformers/utils'

const CODE_IDS_KEYS = ['abstract-account']

const AccountStorageKeys = {
  SUSPENSION_STATUS: 'aa',
  INFO: 'ab',
  ACCOUNT_MODULES: 'ac',
  DEPENDENTS: 'ad',
  SUB_ACCOUNTS: 'ae',
  WHITELISTED_MODULES: 'af',
  ACCOUNT_ID: 'ag',
  OWNER: 'ownership',
}

const suspended = makeTransformer(
  CODE_IDS_KEYS,
  'suspended',
  AccountStorageKeys.SUSPENSION_STATUS
)

const accountId = makeTransformer(
  CODE_IDS_KEYS,
  'accountId',
  AccountStorageKeys.ACCOUNT_ID
)

const accountModules = makeTransformerForMap(
  CODE_IDS_KEYS,
  'accountModules',
  AccountStorageKeys.ACCOUNT_MODULES
)

const subAccounts = makeTransformerForMap(
  CODE_IDS_KEYS,
  'subAccounts',
  AccountStorageKeys.SUB_ACCOUNTS
)

export default [
  // suspended, accountId, accountModules, subAccounts
]
