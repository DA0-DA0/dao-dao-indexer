import { makeSimpleContractFormula } from '../../utils'

type AdminList = {
  admins: string[]
  mutable: boolean
}

export const adminList = makeSimpleContractFormula<AdminList>({
  docs: {
    description: 'retrieves the list of addresses',
  },
  key: 'admin_list',
})
