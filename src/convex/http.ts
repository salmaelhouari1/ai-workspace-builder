import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { getInstagramConfig, parseMetaSignedRequest, safeRedirectBase } from "./lib/meta";
import { randomHex } from "./lib/crypto";

const http = httpRouter();

auth.addHttpRoutes(http);

function redirectToSettings(
  requestUrl: string,
  params: Record<string, string>,
): Response {
  const target = new URL("/app/settings", safeRedirectBase(requestUrl));
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  target.hash = "integrations";
  return Response.redirect(target.toString(), 302);
}

/**
 * OAuth callback. The one-time state is validated and consumed server-side
 * before the authorization code is exchanged.
 */
http.route({
  path: "/integrations/instagram/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denied = url.searchParams.get("error");

    if (denied || !code || !state) {
      return redirectToSettings(request.url, {
        instagram: denied ? "denied" : "error",
        reason: "Instagram authorization was not completed.",
      });
    }

    try {
      await ctx.runAction(internal.instagram.completeOAuth, { code, state });
      return redirectToSettings(request.url, { instagram: "connected" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").slice(0, 180)
          : "Instagram connection failed";
      return redirectToSettings(request.url, {
        instagram: "error",
        reason: message,
      });
    }
  }),
});

async function readSignedRequest(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    return params.get("signed_request") ?? "";
  }
  return (await request.text()).trim();
}

/** Meta deauthorization callback. Revokes the token, retains stored history. */
http.route({
  path: "/integrations/instagram/deauthorize",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const config = getInstagramConfig();
    if (!config.appSecret) {
      return new Response("Instagram is not configured", { status: 503 });
    }
    const signed = await readSignedRequest(request);
    if (!signed) return new Response("Missing signed_request", { status: 400 });
    try {
      const parsed = await parseMetaSignedRequest(signed, config.appSecret);
      if (!parsed.userId) {
        return new Response("Missing user_id", { status: 400 });
      }
      await ctx.runMutation(
        internal.integrations.deauthorizeProviderAccount,
        { appScopedUserId: parsed.userId },
      );
      return Response.json({ ok: true });
    } catch {
      return new Response("Invalid signed_request", { status: 400 });
    }
  }),
});

/** Meta data deletion callback. Hard-deletes provider data for the user. */
http.route({
  path: "/integrations/instagram/data-deletion",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const config = getInstagramConfig();
    if (!config.appSecret) {
      return new Response("Instagram is not configured", { status: 503 });
    }
    const signed = await readSignedRequest(request);
    if (!signed) return new Response("Missing signed_request", { status: 400 });
    try {
      const parsed = await parseMetaSignedRequest(signed, config.appSecret);
      if (!parsed.userId) {
        return new Response("Missing user_id", { status: 400 });
      }
      await ctx.runMutation(internal.integrations.deleteProviderAccountData, {
        appScopedUserId: parsed.userId,
      });
      const confirmationCode = randomHex(8).toUpperCase();
      const base = safeRedirectBase(request.url);
      return Response.json({
        url: `${base}/data-deletion?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
      });
    } catch {
      return new Response("Invalid signed_request", { status: 400 });
    }
  }),
});

/** Meta webhook verification (GET). Insights webhooks are not supported by
 * Instagram Login, but the verification contract is still implemented. */
http.route({
  path: "/integrations/instagram/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = getInstagramConfig().webhookVerifyToken;
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

export default http;
