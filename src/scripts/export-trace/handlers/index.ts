import { HandlerMaker } from '../types'
import { wasm } from './wasm'

export const handlerMakers: Record<string, HandlerMaker> = {
  wasm,
}
