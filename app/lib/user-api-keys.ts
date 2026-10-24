import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt, jwtVerify } from "jose";

export type UserApiKeys = {
  gemini?: string;
  openai?: string;
};

type SessionUser = {
  id: string;
  name: string;
  role: string;
};

async function encryptionKey(secret: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
  );
}

export function apiKeyCookieName(userId: string) {
  return `nadia_ai_keys_${userId.replace(/[^a-z0-9_-]/gi, "")}`;
}

export async function sessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get("nadia_session")?.value;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: String(payload.name || payload.sub),
      role: String(payload.role || "user"),
    };
  } catch {
    return null;
  }
}

export async function readUserApiKeys(user: SessionUser) {
  const secret = process.env.AUTH_SESSION_SECRET;
  const token = (await cookies()).get(apiKeyCookieName(user.id))?.value;
  if (!secret || !token) return {} as UserApiKeys;
  try {
    const { payload } = await jwtDecrypt(token, await encryptionKey(secret));
    if (payload.sub !== user.id) return {};
    return {
      gemini: typeof payload.gemini === "string" ? payload.gemini : undefined,
      openai: typeof payload.openai === "string" ? payload.openai : undefined,
    };
  } catch {
    return {};
  }
}

export async function encryptUserApiKeys(user: SessionUser, keys: UserApiKeys) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("Secret autentikasi belum dikonfigurasi.");
  return new EncryptJWT(keys)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("365d")
    .encrypt(await encryptionKey(secret));
}
