import * as Sentry from '@sentry/node'

export const captureSentryException = (err: any, ctx: any) => {
  Sentry.withScope((scope) => {
    scope.addEventProcessor((event) =>
      Sentry.addRequestDataToEvent(event, ctx.request)
    )
    Sentry.captureException(err)
  })
}
