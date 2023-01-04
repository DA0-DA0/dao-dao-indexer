import {
  ContractFormula,
  GenericFormula,
  NestedFormulaMap,
  TypedFormula,
  WalletFormula,
} from '@/core'

import { contractFormulas, genericFormulas, walletFormulas } from './formulas'

export const getContractFormula = (
  formulaName: string
): ContractFormula<any, any> | undefined => {
  const formulaPath = formulaName.split('/')
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      contractFormulas as
        | NestedFormulaMap<ContractFormula<any, any>>
        | ContractFormula<any, any>
        | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}

export const getWalletFormula = (
  formulaName: string
): WalletFormula<any, any> | undefined => {
  const formulaPath = formulaName.split('/')
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      walletFormulas as
        | NestedFormulaMap<WalletFormula<any, any>>
        | WalletFormula<any, any>
        | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}

export const getGenericFormula = (
  formulaName: string
): GenericFormula<any, any> | undefined => {
  const formulaPath = formulaName.split('/')
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      genericFormulas as
        | NestedFormulaMap<GenericFormula<any, any>>
        | GenericFormula<any, any>
        | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}

export const getTypedFormula = (
  type: 'contract' | 'wallet' | 'generic',
  formulaName: string
): TypedFormula => {
  const typeAndFormula =
    type === 'contract'
      ? {
          type,
          formula: getContractFormula(formulaName),
        }
      : type === 'wallet'
      ? {
          type,
          formula: getWalletFormula(formulaName),
        }
      : {
          type,
          formula: getGenericFormula(formulaName),
        }

  if (!typeAndFormula.formula) {
    throw new Error(`Formula not found: ${formulaName}`)
  }

  return typeAndFormula as TypedFormula
}
