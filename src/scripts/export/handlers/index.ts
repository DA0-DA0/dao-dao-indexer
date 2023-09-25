import { HandlerMaker } from '../types'
import { bank } from './bank'
import { wasm } from './wasm'

export const handlerMakers: Record<string, HandlerMaker> = {
  bank,
  wasm,
}
