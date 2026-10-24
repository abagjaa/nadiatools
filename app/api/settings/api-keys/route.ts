import { NextResponse } from "next/server";
import {
  apiKeyCookieName,
  encryptUserApiKeys,
  readUserApiKeys,
  sessionUser,
  type UserApiKeys,
} from "../../../lib/user-api-keys";

const providers = ["gemini", "openai"] as const;
type Provider = (typeof providers)[number];

function masked(value?: string) {
  return value ? `••••••••${value.slice(-4)}` : "";
}

export async function GET() {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const keys = await readUserApiKeys(user);
  return NextResponse.json({
    user: { id: user.id, name: user.name },
    gemini: { configured: Boolean(keys.gemini), masked: masked(keys.gemini) },
    openai: { configured: Boolean(keys.openai), masked: masked(keys.openai) },
  });
}

export async function PUT(request: Request) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const body = (await request.json()) as { provider?: unknown; key?: unknown };
  if (!providers.includes(body.provider as Provider))
    return NextResponse.json(
      { error: "Provider tidak valid." },
      { status: 400 },
    );
  if (typeof body.key !== "string" || body.key.trim().length < 10)
    return NextResponse.json(
      { error: "API key tidak valid atau terlalu pendek." },
      { status: 400 },
    );
  if (body.key.length > 500)
    return NextResponse.json(
      { error: "API key terlalu panjang." },
      { status: 400 },
    );

  const provider = body.provider as Provider;
  const keys: UserApiKeys = await readUserApiKeys(user);
  keys[provider] = body.key.trim();
  const encrypted = await encryptUserApiKeys(user, keys);
  const response = NextResponse.json({
    ok: true,
    configured: true,
    masked: masked(keys[provider]),
  });
  response.cookies.set(apiKeyCookieName(user.id), encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}

export async function DELETE(request: Request) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const provider = new URL(request.url).searchParams.get(
    "provider",
  ) as Provider;
  if (!providers.includes(provider))
    return NextResponse.json(
      { error: "Provider tidak valid." },
      { status: 400 },
    );
  const keys = await readUserApiKeys(user);
  delete keys[provider];
  const encrypted = await encryptUserApiKeys(user, keys);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(apiKeyCookieName(user.id), encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
