/**
 * Authentik OIDC helpers (discovery + code exchange + userinfo).
 */

export interface OidcConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let cachedDiscovery: OidcConfig | null = null;
let cachedIssuer = "";

export function isOidcConfigured(): boolean {
  return !!(process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET && getIssuer());
}

export function getIssuer(): string {
  const raw = (process.env.AUTHENTIK_ISSUER || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export async function getOidcConfig(): Promise<OidcConfig> {
  const issuer = getIssuer();
  if (!issuer) throw new Error("AUTHENTIK_ISSUER is not configured");
  if (cachedDiscovery && cachedIssuer === issuer) return cachedDiscovery;
  const res = await fetch(`${issuer}.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  const data = (await res.json()) as OidcConfig;
  cachedDiscovery = data;
  cachedIssuer = issuer;
  return data;
}

export function buildAuthorizeUrl(cfg: OidcConfig, params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(cfg.authorization_endpoint);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeCodeForTokens(cfg: OidcConfig, params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ access_token: string; id_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  }
  if (!data.access_token) throw new Error("No access_token in token response");
  return data as { access_token: string; id_token?: string };
}

export async function fetchUserinfo(cfg: OidcConfig, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(cfg.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error("Failed to load user profile from Authentik");
  return data;
}

/** Resolve email from OIDC userinfo / id_token claims. */
export function emailFromOidcClaims(userinfo: Record<string, unknown>): string | null {
  const email = userinfo.email;
  if (typeof email === "string" && email.includes("@")) return email.trim().toLowerCase();
  const preferred = userinfo.preferred_username;
  if (typeof preferred === "string" && preferred.includes("@")) return preferred.trim().toLowerCase();
  const sub = userinfo.sub;
  if (typeof sub === "string" && sub.includes("@")) return sub.trim().toLowerCase();
  return null;
}
