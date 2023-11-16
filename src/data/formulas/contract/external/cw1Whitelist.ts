import { ContractFormula } from '@/core'

type AdminList = {
  admins: string[]
  mutable: boolean
}

export const admins: ContractFormula<string[]> = {
  compute: async ({ contractAddress, get }) =>
    (await get<AdminList>(contractAddress, 'admin_list'))?.admins ?? [],
}
