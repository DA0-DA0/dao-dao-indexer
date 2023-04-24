import * as base from './base'
import * as members from './members'
import * as proposals from './proposals'

export const daoCore = {
  ...base,
  ...proposals,
  ...members,
}
