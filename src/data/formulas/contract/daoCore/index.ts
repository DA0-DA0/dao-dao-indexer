import * as base from './base'
import * as featured from './featured'
import * as juno from './juno'
import * as members from './members'
import * as proposals from './proposals'
import * as tvl from './tvl'
import * as veto from './veto'

export const daoCore = {
  ...base,
  ...featured,
  ...juno,
  ...members,
  ...proposals,
  ...tvl,
  ...veto,
}
