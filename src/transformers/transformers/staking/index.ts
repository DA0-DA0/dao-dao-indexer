import cw20Stake from './cw20Stake'
import oraichainCw20Staking from './oraichainCw20Staking'
import oraichainCw20StakingProxySnapshot from './oraichainCw20StakingProxySnapshot'

export default [
  ...cw20Stake,
  ...oraichainCw20Staking,
  ...oraichainCw20StakingProxySnapshot,
]
