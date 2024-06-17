import * as base from './base'
import * as juno from './juno'
import * as members from './members'
import * as proposals from './proposals'
import * as tvl from './tvl'

export const daoCore = {
  ...base,
  ...juno,
  ...members,
  ...proposals,
  ...tvl,
}
