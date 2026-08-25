import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
const accounts = [
  {
    id: "agus",
    name: "Agus Bagja",
    role: "developer",
    hash: "AUTH_DEVELOPER_HASH",
    access: ["*"],
  },
  {
    id: "nadia",
    name: "Nadia",
    role: "primary",
    hash: "AUTH_NADIA_HASH",
    access: ["*"],
  },
  {
    id: "team",
    name: "Anggota Tim",
    role: "team",
    hash: "AUTH_TEAM_HASH",
    access: ["split-pdf"],
  },
] as const;
const durations: Record<string, number> = {
  "1h": 3600,
  "8h": 28800,
  "1d": 86400,
  "7d": 604800,
};
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      password?: unknown;
      duration?: unknown;
    };
    const { password } = body;
    const duration = typeof body.duration === "string" ? body.duration : "8h";
    if (typeof password !== "string" || !password)
      return NextResponse.json(
        { error: "Password wajib diisi." },
        { status: 400 },
      );
    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret)
      return NextResponse.json(
        { error: "Autentikasi server belum dikonfigurasi." },
        { status: 503 },
      );
    let matched: (typeof accounts)[number] | undefined;
    for (const account of accounts) {
      const hash = process.env[account.hash];
      if (hash && (await bcrypt.compare(password, hash))) {
        matched = account;
        break;
      }
    }
    if (!matched)
      return NextResponse.json(
        { error: "Password tidak dikenali." },
        { status: 401 },
      );
    const maxAge = durations[duration] || durations["8h"];
    const token = await new SignJWT({
      name: matched.name,
      role: matched.role,
      access: matched.access,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(matched.id)
      .setIssuedAt()
      .setExpirationTime(`${maxAge}s`)
      .sign(new TextEncoder().encode(secret));
    const response = NextResponse.json({
      ok: true,
      user: { name: matched.name, role: matched.role },
    });
    response.cookies.set("nadia_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Permintaan login tidak valid." },
      { status: 400 },
    );
  }
}
