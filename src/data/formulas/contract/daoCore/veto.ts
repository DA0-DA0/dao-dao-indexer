import { ContractFormula } from '@/core'

import { isExpirationExpired } from '../../utils'
import {
  config as multipleChoiceConfig,
  proposal as multipleChoiceProposal,
} from '../proposal/daoProposalMultiple'
import { MultipleChoiceProposal } from '../proposal/daoProposalMultiple/types'
import {
  dao,
  config as singleChoiceConfig,
  proposal as singleChoiceProposal,
} from '../proposal/daoProposalSingle'
import {
  Config,
  SingleChoiceProposal,
} from '../proposal/daoProposalSingle/types'
import { ProposalResponse, StatusEnum } from '../proposal/types'
import { ProposalModuleWithInfo, activeProposalModules } from './base'

type VetoableProposalsWithModule = {
  proposalModule: ProposalModuleWithInfo
  proposals: ProposalResponse<any>[]
}

type VetoableProposalDaos = {
  dao: string
  proposalsWithModule: VetoableProposalsWithModule[]
}

export const vetoableProposals: ContractFormula<VetoableProposalDaos[]> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches } = env

    const proposalsWithThisVetoer =
      (
        await getTransformationMatches(
          undefined,
          `proposalVetoer:${contractAddress}`
        )
      )?.map(({ contractAddress, value }) => ({
        proposalModuleAddress: contractAddress,
        proposalId: value,
      })) || []

    const uniqueProposalModuleAddresses = Array.from(
      new Set(
        proposalsWithThisVetoer.map(
          ({ proposalModuleAddress }) => proposalModuleAddress
        )
      )
    )

    const daos = (
      await Promise.all(
        uniqueProposalModuleAddresses.map((contractAddress) =>
          dao.compute({
            ...env,
            contractAddress,
          })
        )
      )
    ).filter((dao): dao is string => !!dao)

    const daoActiveProposalModules = await Promise.all(
      daos.map(
        async (contractAddress) =>
          (await activeProposalModules.compute({
            ...env,
            contractAddress,
          })) || []
      )
    )

    const vetoableProposalDaos = await Promise.all(
      daos.map(
        async (dao, index): Promise<VetoableProposalDaos> => ({
          dao,
          proposalsWithModule: (
            await Promise.all(
              daoActiveProposalModules[index].map(
                async (
                  proposalModule
                ): Promise<VetoableProposalsWithModule | undefined> => {
                  const contractName =
                    proposalModule.info &&
                    proposalModule.info.contract.replace('crates.io:', '')

                  const configFormula =
                    contractName && PROPOSAL_MODULE_CONFIG_MAP[contractName]
                  const proposalFormula =
                    contractName && PROPOSAL_MAP[contractName]

                  if (!configFormula || !proposalFormula) {
                    return
                  }

                  const config = await configFormula.compute({
                    ...env,
                    contractAddress: proposalModule.address,
                  })

                  if (!config?.veto) {
                    return
                  }

                  return {
                    proposalModule,
                    proposals: (
                      await Promise.all(
                        proposalsWithThisVetoer
                          .filter(
                            ({ proposalModuleAddress }) =>
                              proposalModule.address === proposalModuleAddress
                          )
                          .map(({ proposalId }) =>
                            proposalFormula.compute({
                              ...env,
                              contractAddress: proposalModule.address,
                              args: {
                                id: Number(proposalId).toString(),
                              },
                            })
                          )
                      )
                    ).filter(
                      (proposal): proposal is ProposalResponse<any> =>
                        !!proposal &&
                        // Only include open proposals if early execute enabled.
                        ((proposal.proposal.status === StatusEnum.Open &&
                          config.veto?.early_execute) ||
                          // Include all veto timelock proposals that are not
                          // expired.
                          (typeof proposal.proposal.status === 'object' &&
                            'veto_timelock' in proposal.proposal.status &&
                            !isExpirationExpired(
                              env,
                              proposal.proposal.status.veto_timelock.expiration
                            )))
                    ),
                  }
                }
              )
            )
          ).filter(
            (proposalModule): proposalModule is VetoableProposalsWithModule =>
              !!proposalModule?.proposals.length
          ),
        })
      )
    )

    return vetoableProposalDaos
  },
}

// Map contract name to config formula.
const PROPOSAL_MODULE_CONFIG_MAP: Record<
  string,
  ContractFormula<Config | undefined> | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoiceConfig,
  'cw-proposal-single': singleChoiceConfig,
  // V2+
  'cwd-proposal-single': singleChoiceConfig,
  'dao-proposal-single': singleChoiceConfig,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceConfig,
  'dao-proposal-multiple': multipleChoiceConfig,
}

// Map contract name to proposal formula.
const PROPOSAL_MAP: Record<
  string,
  | ContractFormula<
      | ProposalResponse<SingleChoiceProposal | MultipleChoiceProposal>
      | undefined,
      { id: string }
    >
  | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoiceProposal,
  'cw-proposal-single': singleChoiceProposal,
  // V2+
  'cwd-proposal-single': singleChoiceProposal,
  'dao-proposal-single': singleChoiceProposal,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceProposal,
  'dao-proposal-multiple': multipleChoiceProposal,
}
