const identity = (s: string) => s
const handler: ProxyHandler<(...args: any[]) => any> = {
  get: () => identity,
  apply: () => identity,
}
export const color: any = new Proxy((..._args: any[]) => identity, handler)
