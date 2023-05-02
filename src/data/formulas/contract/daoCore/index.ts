import * as base from './base'
import * as featured from './featured'
import * as members from './members'
import * as proposals from './proposals'
import * as tvl from './tvl'

export const daoCore = {
  ...base,
  ...featured,
  ...members,
  ...proposals,
  ...tvl,
}
