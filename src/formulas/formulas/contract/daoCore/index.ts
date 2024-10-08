import * as base from './base'
import * as dump from './dump'
import * as juno from './juno'
import * as members from './members'
import * as proposals from './proposals'

export const daoCore = {
  ...base,
  ...dump,
  ...juno,
  ...members,
  ...proposals,
}
