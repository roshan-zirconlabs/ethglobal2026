// Minimal type shim for the libhalo web API subpath (ships JS without types for
// this export). Only the surface we use from card-halo.ts.
declare module '@arx-research/libhalo/api/web' {
  export function execHaloCmdWeb(
    command: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<any>;
}
