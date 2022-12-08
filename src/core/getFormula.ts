import * as formulas from './formulas'
import { Formula } from './types'

type NestedFormulaMap = {
  [key: string]: Formula<any, any> | NestedFormulaMap | undefined
}

export const getFormula = (
  formulaPath: string[]
): Formula<any, any> | undefined => {
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      formulas as NestedFormulaMap | Formula<any, any> | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}
