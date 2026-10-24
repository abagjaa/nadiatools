import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { readUserApiKeys, sessionUser } from "../../../lib/user-api-keys";

function geminiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const nested = parsed.error?.message ?? parsed.message;
    if (typeof nested === "string") return nested;
  } catch {
    // Pesan dari SDK tidak selalu berupa JSON.
  }
  return raw;
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const apiKey = (await readUserApiKeys(user)).gemini;
  if (!apiKey)
    return NextResponse.json(
      {
        error:
          "Gemini API key pribadi belum diatur. Buka Pengaturan untuk menambahkannya.",
        code: "GEMINI_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 400 },
      );
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json(
        { error: "File melebihi batas sementara 20 MB." },
        { status: 413 },
      );
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: [
        {
          text: "Baca sertifikat SLO/NIDI ini. Dokumen mungkin miring 90, 180, atau 270 derajat: periksa seluruh orientasi dan baca dalam posisi tegak. Jangan mengarang. Kembalikan JSON saja dengan ownerName (nilai persis setelah label Nama pemilik), certificateNumber (nilai setelah label Nomor Sertifikat SLO, bukan Nomor Registrasi), nidi (Nomor Identitas Instalasi Tenaga Listrik), documentType (SLO, NIDI, atau UNKNOWN), confidence angka 0 sampai 1. Periksa kembali ketiga nilai. Gunakan string kosong hanya jika label benar-benar tidak ada.",
        },
        { inlineData: { mimeType: file.type || "application/pdf", data } },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            ownerName: { type: "string" },
            certificateNumber: { type: "string" },
            nidi: { type: "string" },
            documentType: { type: "string", enum: ["SLO", "NIDI", "UNKNOWN"] },
            confidence: { type: "number" },
          },
          required: [
            "ownerName",
            "certificateNumber",
            "nidi",
            "documentType",
            "confidence",
          ],
        },
      },
    });
    const parsed = JSON.parse(response.text || "{}");
    return NextResponse.json(parsed);
  } catch (error) {
    const message = geminiErrorMessage(error);
    const quota = /quota|resource.exhausted|429/i.test(message);
    const unavailable = /high demand|unavailable|temporar|503/i.test(message);
    return NextResponse.json(
      {
        error: quota
          ? "Kuota Gemini hari ini telah habis. Coba lagi setelah kuota tersedia."
          : unavailable
            ? "Gemini sedang sibuk dan belum dapat membaca file ini. Coba lagi beberapa saat lagi."
            : "Gemini gagal membaca dokumen. Coba lagi atau isi data secara manual melalui Preview.",
        code: quota
          ? "GEMINI_QUOTA_EXHAUSTED"
          : unavailable
            ? "GEMINI_UNAVAILABLE"
            : "GEMINI_ERROR",
      },
      { status: quota ? 429 : unavailable ? 503 : 502 },
    );
  }
}
