import { resolve } from "node:path";

export interface RuntimeConfig {
  readonly environment: string | undefined;
  readonly host: string;
  readonly port: number;
  readonly storeDirectory: string;
  readonly allowedHosts: ReadonlySet<string>;
  readonly allowedMutationOrigins: ReadonlySet<string>;
  readonly publicUrl: string | undefined;
  readonly secureCookies: boolean;
  readonly serveFrontend: boolean;
  readonly resendApiKey: string | undefined;
  readonly emailFrom: string | undefined;
}

const localProductionHosts = (port: number): string[] => [`127.0.0.1:${port}`, `localhost:${port}`];
const localProductionOrigins = (port: number): string[] => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error("JOURNEY_PORT must be an integer between 1 and 65535.");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("JOURNEY_PORT must be an integer between 1 and 65535.");
  return port;
}

function parseBoolean(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  throw new Error(`${name} must be true or false.`);
}

function parsePublicUrl(value: string | undefined): URL | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("JOURNEY_PUBLIC_URL must be an absolute http:// or https:// URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.hostname.includes("*") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("JOURNEY_PUBLIC_URL must be an absolute http:// or https:// URL without credentials, a path, or a query.");
  }
  return url;
}

function parseTrustedHost(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.includes("/") || candidate.includes("@") || candidate.includes("?") || candidate.includes("#") || candidate.includes("*")) {
    throw new Error(`JOURNEY_TRUSTED_HOSTS contains an invalid host: ${value}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(`http://${candidate}`);
  } catch {
    throw new Error(`JOURNEY_TRUSTED_HOSTS contains an invalid host: ${value}`);
  }
  if (!parsed.hostname || parsed.hostname.includes("*") || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.host !== candidate.toLowerCase()) {
    throw new Error(`JOURNEY_TRUSTED_HOSTS contains an invalid host: ${value}`);
  }
  return parsed.host;
}

function parseTrustedOrigin(value: string): string {
  const candidate = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`JOURNEY_TRUSTED_ORIGINS contains an invalid origin: ${value}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.hostname.includes("*") || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`JOURNEY_TRUSTED_ORIGINS contains an invalid origin: ${value}`);
  }
  return parsed.origin;
}

function parseList(value: string | undefined, parser: (item: string) => string): string[] {
  if (value === undefined || value.trim() === "") return [];
  return value.split(",").map((item) => parser(item));
}

/**
 * Read the process boundary once at startup. The defaults intentionally match
 * the historical loopback-only development and production behavior.
 */
export function parseRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = env.JOURNEY_ENV;
  const development = environment === "development";
  const port = parsePort(env.JOURNEY_PORT, development ? 4174 : 4173);
  const host = env.JOURNEY_HOST?.trim() || "127.0.0.1";
  const publicUrl = parsePublicUrl(env.JOURNEY_PUBLIC_URL);
  const defaultPorts = development ? [...new Set([5173, 4174, port])] : [port];
  const allowedHosts = new Set(defaultPorts.flatMap((defaultPort) => localProductionHosts(defaultPort)));
  const allowedMutationOrigins = new Set(defaultPorts.flatMap((defaultPort) => localProductionOrigins(defaultPort)));
  const configuredTrustedHosts = parseList(env.JOURNEY_TRUSTED_HOSTS, (item) => parseTrustedHost(item));
  const configuredTrustedOrigins = parseList(env.JOURNEY_TRUSTED_ORIGINS, (item) => parseTrustedOrigin(item));

  if (["0.0.0.0", "::"].includes(host) && !publicUrl && (!configuredTrustedHosts.length || !configuredTrustedOrigins.length)) {
    throw new Error("JOURNEY_PUBLIC_URL is required when JOURNEY_HOST binds all interfaces (or provide both exact trusted host and origin lists).");
  }

  if (publicUrl) {
    allowedHosts.add(publicUrl.host);
    allowedMutationOrigins.add(publicUrl.origin);
  }
  for (const trustedHost of configuredTrustedHosts) allowedHosts.add(trustedHost);
  for (const trustedOrigin of configuredTrustedOrigins) allowedMutationOrigins.add(trustedOrigin);

  const storeDirectory = resolve(process.cwd(), env.JOURNEY_STORE_DIR?.trim() || "data/store");
  const resendApiKey = env.JOURNEY_RESEND_API_KEY?.trim() || undefined;
  const emailFrom = env.JOURNEY_EMAIL_FROM?.trim() || undefined;
  if (emailFrom !== undefined && (!emailFrom.includes("@") || emailFrom.length > 320)) {
    throw new Error("JOURNEY_EMAIL_FROM must be a sender address containing '@' (e.g. 'Waypoint <noreply@example.com>').");
  }
  return {
    environment,
    host,
    port,
    storeDirectory,
    allowedHosts,
    allowedMutationOrigins,
    publicUrl: publicUrl?.origin,
    secureCookies: parseBoolean(env.JOURNEY_SECURE_COOKIES, "JOURNEY_SECURE_COOKIES", publicUrl?.protocol === "https:"),
    serveFrontend: !development,
    resendApiKey,
    emailFrom,
  };
}
