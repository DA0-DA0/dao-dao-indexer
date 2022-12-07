export type Expiration =
  | {
      at_height: number
    }
  | {
      at_time: string
    }
  | {
      never: {}
    }
