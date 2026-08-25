import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
const durations: Record<string, number> = {
  "1h": 3600,
  "8h": 28800,
  "1d": 86400,
  "7d": 604800,
};
export async function POST(request: Request) {
  const token = (await cookies()).get("nadia_session")?.value,
    secret = process.env.AUTH_SESSION_SECRET;
  if (!token || !secret)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  try {
    const body = (await request.json()) as { duration?: unknown };
    if (typeof body.duration !== "string")
      return NextResponse.json(
        { error: "Durasi tidak valid." },
        { status: 400 },
      );
    const duration = body.duration;
    const maxAge = durations[duration];
    if (!maxAge)
      return NextResponse.json(
        { error: "Durasi tidak valid." },
        { status: 400 },
      );
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    const renewed = await new SignJWT({
      name: payload.name,
      role: payload.role,
      access: payload.access,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(payload.sub))
      .setIssuedAt()
      .setExpirationTime(`${maxAge}s`)
      .sign(new TextEncoder().encode(secret));
    const response = NextResponse.json({ ok: true, duration });
    response.cookies.set("nadia_session", renewed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Sesi tidak dapat diperbarui." },
      { status: 401 },
    );
  }
}
