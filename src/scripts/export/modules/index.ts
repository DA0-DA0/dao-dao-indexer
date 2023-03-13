import { ModuleExporterMaker } from '../types'
import { staking } from './staking'
import { wasm } from './wasm'

export const moduleMakers: Record<string, ModuleExporterMaker> = {
  staking,
  wasm,
}
