import daoVotingCw20Staked from './daoVotingCw20Staked'
import daoVotingCw4 from './daoVotingCw4'
import daoVotingCw721Staked from './daoVotingCw721Staked'
import daoVotingNativeStaked from './daoVotingNativeStaked'
import daoVotingOnftStaked from './daoVotingOnftStaked'
import daoVotingSgCommunityNft from './daoVotingSgCommunityNft'
import daoVotingTokenStaked from './daoVotingTokenStaked'

export default [
  ...daoVotingCw20Staked,
  ...daoVotingCw4,
  ...daoVotingCw721Staked,
  ...daoVotingNativeStaked,
  ...daoVotingOnftStaked,
  ...daoVotingSgCommunityNft,
  ...daoVotingTokenStaked,
]
