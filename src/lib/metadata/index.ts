import { metronProvider } from "./metron";
import { MetadataError, PROVIDER_IDS, type MetadataProvider, type ProviderId } from "./types";

export type { CoverOption, MetadataCandidate, MetadataDetail, ProviderId } from "./types";
export { MetadataError } from "./types";

export function isProviderId(x: string): x is ProviderId {
  return (PROVIDER_IDS as string[]).includes(x);
}

/** Providers whose keys are present in the environment (Metron only). */
export function configuredProviders(): ProviderId[] {
  return process.env.METRON_API_KEY ? ["metron"] : [];
}

/** The provider to use, or null if none configured. */
export function defaultProvider(): ProviderId | null {
  return configuredProviders()[0] ?? null;
}

/**
 * Resolve the provider from a client-supplied value: validates it and falls back
 * to the default. Rejects unknown/unconfigured providers with a client-safe error.
 */
export function resolveProvider(raw?: string | null): ProviderId {
  const configured = configuredProviders();
  if (configured.length === 0) throw new MetadataError("Metadata autofill is not configured", 501);
  if (raw && !isProviderId(raw)) throw new MetadataError(`Unknown provider "${raw}"`, 400);
  return defaultProvider() as ProviderId; // non-null: configured is non-empty
}

/** Build the provider client, or throw a client-safe error if its key is missing. */
export function getProvider(_id: ProviderId): MetadataProvider {
  const token = process.env.METRON_API_KEY;
  if (!token) throw new MetadataError("Metron is not configured", 501);
  return metronProvider(token);
}
