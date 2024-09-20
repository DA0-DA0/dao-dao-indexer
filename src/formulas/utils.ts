import {
  AccountFormula,
  ContractFormula,
  FormulaType,
  FormulaTypeValues,
  GenericFormula,
  NestedFormulaMap,
  TypedFormula,
  ValidatorFormula,
} from '@/types'

import {
  accountFormulas,
  contractFormulas,
  genericFormulas,
  validatorFormulas,
} from './formulas'

const makeGetFormula =
  <T extends unknown>(formulas: NestedFormulaMap<T> | T | undefined) =>
  (formulaName: string): T | undefined => {
    const formulaPath = formulaName.split('/')
    const formulaBase = formulaPath
      .slice(0, -1)
      .reduce(
        (acc, key) =>
          acc && typeof acc === 'object' && key in acc
            ? (acc as NestedFormulaMap<T>)[key]
            : undefined,
        formulas
      )

    const formula =
      typeof formulaBase === 'object'
        ? (formulaBase as NestedFormulaMap<ContractFormula<any, any>>)[
            formulaPath[formulaPath.length - 1]
          ]
        : undefined

    return formula &&
      'compute' in formula &&
      typeof formula.compute === 'function'
      ? (formula as T)
      : undefined
  }

const getAccountFormula = makeGetFormula<AccountFormula>(accountFormulas)
const getContractFormula = makeGetFormula<ContractFormula>(contractFormulas)
const getGenericFormula = makeGetFormula<GenericFormula>(genericFormulas)
const getValidatorFormula = makeGetFormula<ValidatorFormula>(validatorFormulas)

export const getTypedFormula = (
  type: FormulaType,
  formulaName: string
): TypedFormula => {
  const typeAndFormula =
    type === FormulaType.Account
      ? {
          type,
          formula: getAccountFormula(formulaName),
        }
      : type === FormulaType.Contract
      ? {
          type,
          formula: getContractFormula(formulaName),
        }
      : type === FormulaType.Generic
      ? {
          type,
          formula: getGenericFormula(formulaName),
        }
      : type === FormulaType.Validator
      ? {
          type,
          formula: getValidatorFormula(formulaName),
        }
      : undefined

  if (!typeAndFormula?.formula) {
    throw new Error(`Formula not found: ${formulaName}`)
  }

  return {
    name: formulaName,
    ...typeAndFormula,
  } as TypedFormula
}

export const typeIsFormulaTypeOrWallet = (
  type: string
): type is FormulaType | 'wallet' =>
  FormulaTypeValues.includes(type as FormulaType) ||
  // Backwards compatibility for deprecated wallet type.
  type === 'wallet'
