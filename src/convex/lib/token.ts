const DAY = 86_400_000;

/**
 * Refresh a long-lived token when it is close to expiry, but only after the
 * token has existed for at least 24 hours (a Meta refresh requirement).
 */
export function shouldRefreshToken(
  expiresAt: number | undefined,
  connectedAt: number,
  now = Date.now(),
): boolean {
  if (expiresAt === undefined) return false;
  return expiresAt < now + 7 * DAY && now - connectedAt > DAY;
}

export function tokenExpiresAt(
  expiresInSeconds: number | undefined,
  now = Date.now(),
): number {
  const seconds =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? expiresInSeconds
      : 60 * 24 * 60 * 60;
  return now + seconds * 1000;
}
