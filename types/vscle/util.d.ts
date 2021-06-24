export type NonEmpty<T> = T extends Array<infer U> ? U[] & { 0: U } : never;
export type FilePath = string;
export type ZmqURI = string;