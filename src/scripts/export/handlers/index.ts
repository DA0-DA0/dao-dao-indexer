import { HandlerMaker } from '../types'
import { bank } from './bank'
import { gov } from './gov'
import { wasm } from './wasm'

export const handlerMakers: Record<string, HandlerMaker<any>> = {
  bank,
  gov,
  wasm,
}
