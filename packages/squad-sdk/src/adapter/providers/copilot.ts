/**
 * Copilot runtime provider.
 *
 * The original `SquadClient` (adapter/client.ts) IS the Copilot
 * implementation of the {@link SquadRuntimeProvider} seam — re-exported here
 * under its provider name so call sites that select runtimes by id have a
 * symmetric import path with `providers/claude.ts`. The class body stays in
 * adapter/client.ts to keep its import path (and every existing consumer)
 * stable.
 *
 * @module adapter/providers/copilot
 */

export { SquadClient, SquadClient as CopilotRuntimeProvider } from '../client.js';
export type { SquadClientOptions, SquadConnectionState } from '../client.js';
