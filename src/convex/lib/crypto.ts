/**
 * Server-only crypto helpers for integration credentials.
 *
 * Tokens are encrypted with AES-256-GCM using a key derived from the Convex
 * environment variable. The resulting string is safe to store in Convex but is
 * never returned by a public query. OAuth state is stored only as a SHA-256
 * hash. No secret is ever logged.
 */

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triplet = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += b === undefined ? "=" : alphabet[(triplet >> 6) & 63];
    output += c === undefined ? "=" : alphabet[triplet & 63];
  }
  return output;
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function fromBase64(value: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Map([...alphabet].map((char, index) => [char, index]));
  const clean = value.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const digit = lookup.get(char);
    if (digit === undefined) throw new Error("Invalid encrypted payload");
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  return toBase64(bytes);
}

export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.trim().length < 32) {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return await crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** AES-256-GCM payload: `v1.iv.ciphertext` (both base64). */
export async function encryptSecret(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    encoder.encode(plaintext),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(
  payload: string,
  secret: string,
): Promise<string> {
  const [version, ivValue, cipherValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !cipherValue) {
    throw new Error("Unsupported encrypted payload");
  }
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(fromBase64(ivValue)) },
    key,
    asBufferSource(fromBase64(cipherValue)),
  );
  return new TextDecoder().decode(plaintext);
}

/** HMAC-SHA256 verification used for Meta signed_request payloads. */
export async function verifyHmacSha256(
  payload: string,
  signatureBase64Url: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = fromBase64(
    signatureBase64Url.replace(/-/g, "+").replace(/_/g, "/"),
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    asBufferSource(signature),
    encoder.encode(payload),
  );
}

export function base64UrlDecode(value: string): string {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(fromBase64(padded));
}
