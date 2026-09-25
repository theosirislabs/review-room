import { lookup as dnsLookup } from "dns/promises";
import { isIP } from "net";

export const MAX_EXTERNAL_MEDIA_BYTES = 256 * 1024 * 1024;

export type AddressLookup = (hostname: string) => Promise<string[]>;

export type ExternalMediaFetchOptions = {
  fetchImpl?: typeof fetch;
  lookup?: AddressLookup;
  maxRedirects?: number;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const defaultLookup: AddressLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

const ipv4Number = (address: string): number | null => {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    value = value * 256 + number;
  }
  return value >>> 0;
};

const ipv4InRange = (value: number, start: number, end: number): boolean => value >= start && value <= end;

export function isPrivateOrReservedAddress(address: string): boolean {
  const clean = address.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const ipVersion = isIP(clean);
  if (ipVersion === 4) {
    const value = ipv4Number(clean);
    if (value === null) return true;
    return ipv4InRange(value, 0x00000000, 0x00ffffff)
      || ipv4InRange(value, 0x0a000000, 0x0affffff)
      || ipv4InRange(value, 0x64400000, 0x647fffff)
      || ipv4InRange(value, 0x7f000000, 0x7fffffff)
      || ipv4InRange(value, 0xa9fe0000, 0xa9feffff)
      || ipv4InRange(value, 0xac100000, 0xac1fffff)
      || ipv4InRange(value, 0xc0000000, 0xc00000ff)
      || ipv4InRange(value, 0xc0000200, 0xc00002ff)
      || ipv4InRange(value, 0xc0586300, 0xc05863ff)
      || ipv4InRange(value, 0xc0a80000, 0xc0a8ffff)
      || ipv4InRange(value, 0xc6120000, 0xc613ffff)
      || ipv4InRange(value, 0xc6336400, 0xc63364ff)
      || ipv4InRange(value, 0xcb007100, 0xcb0071ff)
      || ipv4InRange(value, 0xe0000000, 0xffffffff);
  }
  if (ipVersion !== 6) return true;
  const groups = expandIpv6(clean);
  if (!groups) return true;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = `${(groups[6] >> 8) & 0xff}.${groups[6] & 0xff}.${(groups[7] >> 8) & 0xff}.${groups[7] & 0xff}`;
    return isPrivateOrReservedAddress(mapped);
  }
  if (groups.every((group) => group === 0) || (groups[0] === 0 && groups.slice(1, 7).every((group) => group === 0) && groups[7] === 1)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if ((groups[0] & 0xe000) !== 0x2000) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0000) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0002 && groups[2] === 0) return true;
  if (groups[0] === 0x2001 && (groups[1] & 0xfff0) === 0x0010) return true;
  if (groups[0] === 0x2001 && (groups[1] & 0xfff0) === 0x0020) return true;
  return false;
}

function expandIpv6(address: string): number[] | null {
  let value = address.toLowerCase();
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = ipv4Number(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, lastColon + 1)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): string[] => half ? half.split(":") : [];
  const left = parseHalf(halves[0]);
  const right = halves.length === 2 ? parseHalf(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const parts = halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => "0"), ...right]
    : left;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 16));
}

export function isBlockedExternalHostname(hostname: string): boolean {
  const value = hostname.trim().toLowerCase().replace(/\.$/, "");
  return value === "localhost"
    || value.endsWith(".localhost")
    || value === "localhost.localdomain"
    || value === "metadata"
    || value === "metadata.google.internal"
    || value.endsWith(".internal")
    || value.endsWith(".local");
}

export function normalizeExternalMediaUrl(raw: string): string {
  const value = raw.trim();
  if (value.length > 4096) throw new Error("External media URL is too long");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("A valid URL is required");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "drive.google.com") {
    const fileMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
    const fileId = fileMatch?.[1] || parsed.searchParams.get("id");
    if (fileId) {
      parsed.pathname = "/uc";
      parsed.search = "";
      parsed.searchParams.set("export", "download");
      parsed.searchParams.set("id", fileId);
    }
  } else if (hostname === "dropbox.com" || hostname.endsWith(".dropbox.com")) {
    parsed.searchParams.set("dl", "1");
  }
  return parsed.toString();
}

export function validateExternalMediaUrlSyntax(raw: string): URL {
  const normalized = normalizeExternalMediaUrl(raw);
  const parsed = new URL(normalized);
  if (parsed.username || parsed.password) throw new Error("URL credentials are not allowed");
  if (!parsed.hostname || isBlockedExternalHostname(parsed.hostname)) throw new Error("External media host is not allowed");
  const ipHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(ipHostname) && isPrivateOrReservedAddress(ipHostname)) throw new Error("External media address is not allowed");
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") throw new Error("External media port is not allowed");
  return parsed;
}

export function assertSafeExternalAddresses(hostname: string, addresses: string[]): void {
  if (isBlockedExternalHostname(hostname)) throw new Error("External media host is not allowed");
  if (!addresses.length) throw new Error("External media host could not be resolved");
  if (addresses.some((address) => typeof address !== "string" || isPrivateOrReservedAddress(address))) {
    throw new Error("External media host resolves to a private or reserved address");
  }
}

export async function resolveExternalMediaUrl(raw: string, lookup: AddressLookup = defaultLookup): Promise<URL> {
  const parsed = validateExternalMediaUrlSyntax(raw);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await lookup(hostname);
  assertSafeExternalAddresses(hostname, addresses);
  return parsed;
}

export async function fetchExternalMedia(
  raw: string,
  options: ExternalMediaFetchOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;
  const lookup = options.lookup || defaultLookup;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = await resolveExternalMediaUrl(raw, lookup);
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetchImpl(current.toString(), {
      redirect: "manual",
      signal: options.signal,
      headers: options.headers,
    });
    if (!redirectStatuses.has(response.status)) {
      if (response.url && response.url !== current.toString()) {
        await resolveExternalMediaUrl(response.url, lookup);
      }
      return response;
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("External media redirect had no destination");
    if (redirectCount >= maxRedirects) throw new Error("External media redirect limit exceeded");
    try {
      await response.body?.cancel();
    } catch {
    }
    current = await resolveExternalMediaUrl(new URL(location, current).toString(), lookup);
  }
}
