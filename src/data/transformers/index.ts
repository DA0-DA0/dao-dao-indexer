import {
  Config,
  ProcessedTransformer,
  Transformer,
  TransformerMaker,
} from '@/core'

import common from './common'
import dao from './dao'
import external from './external'
import polytone from './polytone'
import proposal from './proposal'
import staking from './staking'
import voting from './voting'

let processedTransformers: ProcessedTransformer[] | undefined
export const getProcessedTransformers = (
  config: Config
): ProcessedTransformer[] => {
  if (!processedTransformers) {
    const transformerMakers: TransformerMaker[] = [
      // Add transformer makers here.
    ]

    const _transformers: Transformer[] = [
      // Add transformers here.
      ...common,
      ...dao,
      ...external,
      ...polytone,
      ...proposal,
      ...staking,
      ...voting,

      // Makers.
      ...transformerMakers.map((maker) => maker(config)),
    ]

    processedTransformers = _transformers.map(({ filter, ...webhook }) => {
      const allCodeIds = filter.codeIdsKeys?.flatMap(
        (key) => config.codeIds?.[key] ?? []
      )

      return {
        ...webhook,
        filter: (event) => {
          let match = true

          if (allCodeIds?.length) {
            match &&= allCodeIds.includes(event.codeId)
          }

          if (match && filter.contractAddresses?.length) {
            match &&= filter.contractAddresses.includes(event.contractAddress)
          }

          if (match && filter.matches) {
            // Wrap in try/catch in case a transformer errors. Don't want to
            // prevent other events from transforming.
            try {
              match &&= filter.matches(event)
            } catch (error) {
              // TODO: Store somewhere.
              console.error(
                `Error matching transformer for event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
              )

              // On error, do not match.
              match = false
            }
          }

          return match
        },
      }
    })
  }

  return processedTransformers
}
