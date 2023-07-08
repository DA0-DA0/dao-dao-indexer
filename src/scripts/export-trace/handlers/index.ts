import { HandlerMaker } from '../types'
import { wasm } from './wasm'

// Lines will be handled in the order of this array, so earlier handlers take
// precedence. If an earlier handler returns true, the line will not be passed
// to later handlers.
export const handlerMakers: Record<string, HandlerMaker> = {
  wasm,
}
