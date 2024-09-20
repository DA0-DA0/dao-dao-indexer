import { Op } from 'sequelize'

import { AccountFormula, ContractFormula } from '@/types'

import {
  ProposalModuleWithInfo,
  activeProposalModules,
} from '../contract/daoCore/base'
import {
  config as multipleChoiceConfig,
  proposal as multipleChoiceProposal,
} from '../contract/proposal/daoProposalMultiple'
import { MultipleChoiceProposal } from '../contract/proposal/daoProposalMultiple/types'
import {
  dao,
  config as singleChoiceConfig,
  proposal as singleChoiceProposal,
} from '../contract/proposal/daoProposalSingle'
import {
  Config,
  SingleChoiceProposal,
} from '../contract/proposal/daoProposalSingle/types'
import { ProposalResponse, StatusEnum } from '../contract/proposal/types'

type VetoableProposalsWithModule = {
  proposalModule: ProposalModuleWithInfo
  proposals: ProposalResponse<any>[]
}

type VetoableProposalDaos = {
  dao: string
  proposalsWithModule: VetoableProposalsWithModule[]
}

export const vetoableProposals: AccountFormula<VetoableProposalDaos[]> = {
  compute: async (env) => {
    const { address, getTransformationMatches, getCodeIdsForKeys } = env

    // Get all cw1-whitelist contracts with this wallet as an admin.
    const cw1WhitelistCodeIds = getCodeIdsForKeys('cw1-whitelist')
    const cw1WhitelistContracts = cw1WhitelistCodeIds.length
      ? (await getTransformationMatches(
          undefined,
          'admins',
          {
            [Op.contains]: address,
          },
          cw1WhitelistCodeIds
        )) ?? []
      : []

    // Get all proposals with a vetoer set to this wallet or a cw1-whitelist
    // contract where this wallet is an admin.
    const proposalsWithThisVetoer =
      (
        await Promise.all([
          getTransformationMatches(undefined, `proposalVetoer:${address}:*`),
          ...cw1WhitelistContracts.map(({ contractAddress }) =>
            getTransformationMatches(
              undefined,
              `proposalVetoer:${contractAddress}:*`
            )
          ),
        ])
      )?.flatMap(
        (matches) =>
          matches?.map(({ contractAddress, value }) => ({
            proposalModuleAddress: contractAddress,
            proposalId: value,
          })) ?? []
      ) || []

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

    const vetoableProposalDaos = (
      await Promise.all(
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

                    const config = await configFormula
                      .compute({
                        ...env,
                        contractAddress: proposalModule.address,
                      })
                      .catch(() => undefined)

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
                          // Only include open proposals if early execute
                          // enabled.
                          ((proposal.proposal.status === StatusEnum.Open &&
                            config.veto?.early_execute) ||
                            // Include all veto timelock proposals.
                            (typeof proposal.proposal.status === 'object' &&
                              'veto_timelock' in proposal.proposal.status))
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
    ).filter(({ proposalsWithModule }) => proposalsWithModule.length > 0)

    return vetoableProposalDaos
  },
}

// Map contract name to config formula.
const PROPOSAL_MODULE_CONFIG_MAP: Record<
  string,
  ContractFormula<Config> | undefined
> = {
  // Single choice V1
  'cw-govmod-single': singleChoiceConfig,
  'cw-proposal-single': singleChoiceConfig,
  // V2+
  'cwd-proposal-single': singleChoiceConfig,
  'dao-proposal-single': singleChoiceConfig,
  // Neutron
  'cwd-subdao-proposal-single': singleChoiceConfig,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceConfig,
  'dao-proposal-multiple': multipleChoiceConfig,
}

// Map contract name to proposal formula.
const PROPOSAL_MAP: Record<
  string,
  | ContractFormula<
      ProposalResponse<SingleChoiceProposal | MultipleChoiceProposal> | null,
      { id: string }
    >
  | undefined
> = {
  // Single choice V1
  'cw-govmod-single': singleChoiceProposal,
  'cw-proposal-single': singleChoiceProposal,
  // V2+
  'cwd-proposal-single': singleChoiceProposal,
  'dao-proposal-single': singleChoiceProposal,
  // Neutron
  'cwd-subdao-proposal-single': singleChoiceProposal,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceProposal,
  'dao-proposal-multiple': multipleChoiceProposal,
}
