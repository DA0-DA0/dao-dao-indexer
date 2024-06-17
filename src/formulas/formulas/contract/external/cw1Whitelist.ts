import { ContractFormula } from '../../../types'

type AdminList = {
  admins: string[]
  mutable: boolean
}

export const adminList: ContractFormula<AdminList | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get<AdminList>(contractAddress, 'admin_list'),
}
