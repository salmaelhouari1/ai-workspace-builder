/**
 * Official Instagram API with Instagram Login.
 *
 * All requests here are server-side. The app secret and access tokens never
 * go to the browser and are never logged. Missing insight data is represented
 * as null/empty, never as zero.
 */

import { base64UrlDecode, verifyHmacSha256 } from "./crypto";

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_URL = "https://graph.instagram.com";
const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";

export interface InstagramConfig {
  appId: string | null;
  appSecret: string | null;
  redirectUri: string | null;
  graphVersion: string;
  webhookVerifyToken: string | null;
  encryptionKey: string | null;
  appBaseUrl: string | null;
  missing: string[];
  configured: boolean;
}

export function getInstagramConfig(): InstagramConfig {
  const appId = process.env.INSTAGRAM_APP_ID?.trim() || null;
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim() || null;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI?.trim() || null;
  const graphVersion =
    process.env.INSTAGRAM_GRAPH_VERSION?.trim() || "v26.0";
  const webhookVerifyToken =
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim() || null;
  const encryptionKey =
    process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() || null;
  const appBaseUrl = process.env.OCIVO_APP_URL?.trim() || null;

  const missing: string[] = [];
  if (!appId) missing.push("INSTAGRAM_APP_ID");
  if (!appSecret) missing.push("INSTAGRAM_APP_SECRET");
  if (!redirectUri) missing.push("INSTAGRAM_REDIRECT_URI");
  if (!appBaseUrl) missing.push("OCIVO_APP_URL");
  if (!encryptionKey) missing.push("INTEGRATIONS_ENCRYPTION_KEY");
  if (graphVersion && !/^v\d+\.\d+$/.test(graphVersion)) {
    missing.push("INSTAGRAM_GRAPH_VERSION (format: v26.0)");
  }

  return {
    appId,
    appSecret,
    redirectUri,
    graphVersion,
    webhookVerifyToken,
    encryptionKey,
    appBaseUrl,
    missing,
    configured: missing.length === 0,
  };
}

export function authorizationUrl(state: string, forceReauth = false): string {
  const config = getInstagramConfig();
  if (!config.configured || !config.appId || !config.redirectUri) {
    throw new Error("Instagram is not configured");
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "false");
  if (forceReauth) url.searchParams.set("force_reauth", "true");
  return url.toString();
}

export class InstagramApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status = 0, code: string | null = null) {
    super(message);
    this.name = "InstagramApiError";
    this.status = status;
    this.code = code;
  }
}

export function isInstagramAuthError(error: unknown): boolean {
  return (
    error instanceof InstagramApiError &&
    (error.status === 401 || error.code === "190" || error.code === "102")
  );
}

async function readError(response: Response): Promise<InstagramApiError> {
  let message = `Instagram request failed (${response.status})`;
  let code: string | null = null;
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        type?: string;
        code?: number | string;
      };
      error_message?: string;
      error_type?: string;
      code?: number | string;
    };
    message =
      body.error?.message ||
      body.error_message ||
      body.error?.type ||
      body.error_type ||
      message;
    code =
      body.error?.code !== undefined
        ? String(body.error.code)
        : body.code !== undefined
          ? String(body.code)
          : null;
  } catch {
    // Keep the status-only message; never print a response body that may echo
    // request parameters.
  }
  return new InstagramApiError(message.slice(0, 300), response.status, code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<T> {
  const config = getInstagramConfig();
  const url = new URL(`${GRAPH_URL}/${config.graphVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", accessToken);

  let lastError: InstagramApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (response.ok) return (await response.json()) as T;
    const error = await readError(response);
    lastError = error;
    const retryable =
      error.status === 429 ||
      error.status >= 500 ||
      error.code === "4" ||
      error.code === "17";
    if (!retryable || attempt === 2) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 8_000)
      : 500 * 2 ** attempt;
    await sleep(wait);
  }
  throw lastError ?? new InstagramApiError("Instagram request failed");
}

export interface InstagramTokenResult {
  accessToken: string;
  userId: string;
  permissions: string[];
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<InstagramTokenResult> {
  const config = getInstagramConfig();
  if (!config.configured || !config.appId || !config.appSecret || !config.redirectUri) {
    throw new Error("Instagram is not configured");
  }
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) throw await readError(response);
  const raw = (await response.json()) as {
    data?: Array<{
      access_token?: string;
      user_id?: string;
      permissions?: string;
    }>;
    access_token?: string;
    user_id?: string;
    permissions?: string;
  };
  const item = raw.data?.[0] ?? raw;
  if (!item.access_token) throw new Error("Instagram did not return an access token");
  return {
    accessToken: item.access_token,
    userId: String(item.user_id ?? ""),
    permissions: String(item.permissions ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

export async function exchangeLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const config = getInstagramConfig();
  if (!config.appSecret) throw new Error("Instagram is not configured");
  const url = new URL(`${GRAPH_URL}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await readError(response);
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Instagram did not return a long-lived token");
  return {
    accessToken: data.access_token,
    expiresIn:
      typeof data.expires_in === "number" ? data.expires_in : 60 * 24 * 3600,
  };
}

export async function refreshLongLivedToken(
  token: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(REFRESH_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await readError(response);
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Instagram did not refresh the token");
  return {
    accessToken: data.access_token,
    expiresIn:
      typeof data.expires_in === "number" ? data.expires_in : 60 * 24 * 3600,
  };
}

export interface InstagramProfile {
  id: string;
  userId: string;
  username: string;
  name: string | null;
  accountType: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}

export async function fetchProfile(
  accessToken: string,
): Promise<InstagramProfile> {
  const raw = await graphGet<{
    data?: Array<Record<string, unknown>>;
    id?: string;
    user_id?: string;
    username?: string;
    name?: string;
    account_type?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }>(
    "me",
    {
      fields:
        "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count",
    },
    accessToken,
  );
  const item = raw.data?.[0] ?? raw;
  return {
    id: String(item.id ?? item.user_id ?? ""),
    userId: String(item.user_id ?? item.id ?? ""),
    username: String(item.username ?? ""),
    name: typeof item.name === "string" ? item.name : null,
    accountType:
      typeof item.account_type === "string" ? item.account_type : null,
    profilePictureUrl:
      typeof item.profile_picture_url === "string"
        ? item.profile_picture_url
        : null,
    followersCount:
      typeof item.followers_count === "number" ? item.followers_count : null,
    followsCount:
      typeof item.follows_count === "number" ? item.follows_count : null,
    mediaCount:
      typeof item.media_count === "number" ? item.media_count : null,
  };
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaProductType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: number;
  likeCount: number | null;
  commentsCount: number | null;
}

export async function fetchRecentMedia(
  accountId: string,
  accessToken: string,
  limit = 30,
): Promise<InstagramMedia[]> {
  type Raw = {
    data?: Array<{
      id?: string;
      caption?: string;
      media_type?: string;
      media_product_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }>;
  };
  const raw = await graphGet<Raw>(
    `${accountId}/media`,
    {
      fields:
        "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    },
    accessToken,
  );
  const result: InstagramMedia[] = [];
  for (const item of raw.data ?? []) {
    if (!item.id) continue;
    const timestamp = item.timestamp ? Date.parse(item.timestamp) : NaN;
    if (!Number.isFinite(timestamp)) continue;
    result.push({
      id: item.id,
      caption: typeof item.caption === "string" ? item.caption : null,
      mediaType: item.media_type ?? "UNKNOWN",
      mediaProductType: item.media_product_type ?? null,
      permalink: item.permalink ?? null,
      thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
      timestamp,
      likeCount: typeof item.like_count === "number" ? item.like_count : null,
      commentsCount:
        typeof item.comments_count === "number" ? item.comments_count : null,
    });
  }
  return result;
}

export interface InsightMetricResult {
  value: number | null;
  breakdown: Array<{ key: string; value: number }>;
  values: Array<{ date: string; value: number }>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseInsight(data: unknown): InsightMetricResult {
  const item = data as {
    total_value?: {
      value?: unknown;
      breakdowns?: Array<{
        dimension_keys?: string[];
        results?: Array<{
          dimension_values?: string[];
          value?: unknown;
        }>;
      }>;
    };
    values?: Array<{ end_time?: string; value?: unknown }>;
  };
  const breakdown: Array<{ key: string; value: number }> = [];
  for (const set of item.total_value?.breakdowns ?? []) {
    for (const row of set.results ?? []) {
      const value = numberOrNull(row.value);
      if (value === null) continue;
      breakdown.push({
        key: (row.dimension_values ?? []).join(" / ") || "unknown",
        value,
      });
    }
  }
  return {
    value: numberOrNull(item.total_value?.value),
    breakdown,
    values: (item.values ?? []).flatMap((point) => {
      const value = numberOrNull(point.value);
      const endTime = point.end_time;
      if (value === null || !endTime) return [];
      return [{ date: endTime, value }];
    }),
  };
}

export async function fetchAccountInsight(
  accountId: string,
  accessToken: string,
  metric: string,
  since: number,
  until: number,
): Promise<InsightMetricResult> {
  const raw = await graphGet<{ data?: unknown[] }>(
    `${accountId}/insights`,
    {
      metric,
      period: "day",
      metric_type: "total_value",
      since: String(Math.floor(since / 1000)),
      until: String(Math.floor(until / 1000)),
    },
    accessToken,
  );
  return parseInsight(raw.data?.[0]);
}

export async function fetchDemographicInsight(
  accountId: string,
  accessToken: string,
  metric: "follower_demographics" | "engaged_audience_demographics",
  breakdown: "age" | "country" | "gender" | "city",
): Promise<Array<{ label: string; value: number }>> {
  const raw = await graphGet<{ data?: unknown[] }>(
    `${accountId}/insights`,
    {
      metric,
      period: "lifetime",
      timeframe: "last_30_days",
      breakdown,
      metric_type: "total_value",
    },
    accessToken,
  );
  const parsed = parseInsight(raw.data?.[0]);
  return parsed.breakdown
    .map((item) => ({ label: item.key, value: item.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

export async function fetchAccountTimeSeries(
  accountId: string,
  accessToken: string,
  metric: string,
  since: number,
  until: number,
): Promise<Array<{ date: string; value: number }>> {
  const raw = await graphGet<{ data?: unknown[] }>(
    `${accountId}/insights`,
    {
      metric,
      period: "day",
      metric_type: "time_series",
      since: String(Math.floor(since / 1000)),
      until: String(Math.floor(until / 1000)),
    },
    accessToken,
  );
  return parseInsight(raw.data?.[0]).values;
}

export async function fetchFollowerSeries(
  accountId: string,
  accessToken: string,
  since: number,
  until: number,
): Promise<Array<{ date: string; value: number }>> {
  return await fetchAccountTimeSeries(
    accountId,
    accessToken,
    "follower_count",
    since,
    until,
  );
}

export async function fetchMediaInsight(
  mediaId: string,
  accessToken: string,
  metrics: string[],
): Promise<Record<string, number | null>> {
  const raw = await graphGet<{ data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> }>(
    `${mediaId}/insights`,
    {
      metric: metrics.join(","),
      period: "lifetime",
    },
    accessToken,
  );
  const result: Record<string, number | null> = {};
  for (const item of raw.data ?? []) {
    if (!item.name) continue;
    const value = numberOrNull(item.values?.[0]?.value);
    result[item.name] = value;
  }
  return result;
}

export interface MetaSignedRequest {
  algorithm: string;
  userId: string | null;
  issuedAt: number | null;
  raw: Record<string, unknown>;
}

/**
 * Validate a Meta signed_request. The HMAC must match the Instagram app secret;
 * we additionally reject malformed payloads and stale requests.
 */
export async function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<MetaSignedRequest> {
  const [signature, payload] = signedRequest.split(".");
  if (!signature || !payload) throw new Error("Malformed signed request");
  const valid = await verifyHmacSha256(payload, signature, appSecret);
  if (!valid) throw new Error("Invalid signed request signature");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid signed request payload");
  }
  const algorithm = String(parsed.algorithm ?? "");
  if (algorithm !== "HMAC-SHA256") {
    throw new Error("Unsupported signed request algorithm");
  }
  const issuedAt =
    typeof parsed.issued_at === "number" ? parsed.issued_at * 1000 : null;
  if (issuedAt && Date.now() - issuedAt > 60 * 60 * 1000) {
    throw new Error("Signed request has expired");
  }
  return {
    algorithm,
    userId:
      typeof parsed.user_id === "string" || typeof parsed.user_id === "number"
        ? String(parsed.user_id)
        : null,
    issuedAt,
    raw: parsed,
  };
}

export function safeRedirectBase(requestUrl: string): string {
  const configured = process.env.OCIVO_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}
