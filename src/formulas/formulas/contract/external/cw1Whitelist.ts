import { makeSimpleContractFormula } from '../../utils'

type AdminList = {
  admins: string[]
  mutable: boolean
}

export const adminList = makeSimpleContractFormula<AdminList>({
  key: 'admin_list',
})
