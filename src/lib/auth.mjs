/**
 * OAuth via chrome.identity.getAuthToken.
 * Scopes come from manifest `oauth2.scopes`. Chrome caches + refreshes the token.
 */

export async function getToken({ interactive }) {
  const result = await chrome.identity.getAuthToken({ interactive });
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new Error("Google sign-in was cancelled or returned no token.");
  return token;
}

/** Drop a token Chrome cached but Google rejected (e.g. after revoke), then retry once. */
export async function withFreshTokenRetry(fn) {
  try {
    return await fn(await getToken({ interactive: true }));
  } catch (err) {
    if (err?.status !== 401) throw err;
    const stale = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
    const token = typeof stale === "string" ? stale : stale?.token;
    if (token) await chrome.identity.removeCachedAuthToken({ token });
    return fn(await getToken({ interactive: true }));
  }
}

export async function disconnect() {
  const stale = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
  const token = typeof stale === "string" ? stale : stale?.token;
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: "POST",
    }).catch(() => {});
    await chrome.identity.removeCachedAuthToken({ token }).catch(() => {});
  }
  await chrome.identity.clearAllCachedAuthTokens?.().catch(() => {});
}
