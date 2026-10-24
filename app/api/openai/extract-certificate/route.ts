import { NextResponse } from "next/server";
import OpenAI from "openai";
import { readUserApiKeys, sessionUser } from "../../../lib/user-api-keys";
type Result = {
  ownerName: string;
  certificateNumber: string;
  nidi: string;
  documentType: "SLO" | "NIDI" | "UNKNOWN";
  confidence: number;
  modelUsed?: string;
  fallbackUsed?: boolean;
};
const prompt =
  "Baca sertifikat SLO atau NIDI ini secara teliti. Dokumen scan mungkin miring 90, 180, atau 270 derajat: periksa seluruh orientasi dan baca dalam posisi tegak. Ambil hanya nilai yang tercetak pada dokumen, jangan mengarang. Cari label Nama pemilik, Nomor Sertifikat, dan Nomor Identitas Instalasi Tenaga Listrik (NIDI). Nama pemilik harus persis seperti dokumen. certificateNumber adalah seluruh nilai setelah label Nomor Sertifikat, bukan Nomor Registrasi. Pertahankan setiap huruf, angka, titik, garis miring, dan tanda hubung sesuai cetakan; jangan menghapus karakter. Untuk NIDI, karakter awal biasanya huruf kapital I, bukan angka 1. Perbesar dan baca ulang setiap kelompok karakter minimal dua kali sebelum menjawab. Gunakan string kosong hanya jika label benar-benar tidak ada.";
const schema = {
  type: "object",
  additionalProperties: false,
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
};
function suspicious(r: Result) {
  const number = /^[A-Z0-9]+(?:[.\/-][A-Z0-9]+){2,}$/i;
  return (
    !r.ownerName?.trim() ||
    !number.test(r.certificateNumber?.trim()) ||
    !number.test(r.nidi?.trim()) ||
    Number(r.confidence) < 0.88
  );
}
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const apiKey = (await readUserApiKeys(user)).openai;
  if (!apiKey)
    return NextResponse.json(
      {
        error:
          "OpenAI API key pribadi belum diatur. Buka Pengaturan untuk menambahkannya.",
        code: "OPENAI_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  try {
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 400 },
      );
    if (file.size > 50 * 1024 * 1024)
      return NextResponse.json(
        { error: "Ukuran file maksimal 50 MB." },
        { status: 413 },
      );
    const validatedFile = file;
    const mime = validatedFile.type || "application/pdf",
      encoded = Buffer.from(await validatedFile.arrayBuffer()).toString(
        "base64",
      ),
      client = new OpenAI({ apiKey, timeout: 120_000 });
    async function read(model: string) {
      const response = await client.responses.create({
        model,
        store: false,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              {
                type: "input_file",
                filename: validatedFile.name,
                file_data: `data:${mime};base64,${encoded}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "certificate_fields",
            strict: true,
            schema,
          },
        },
      });
      if (!response.output_text)
        throw new Error("OpenAI tidak mengembalikan hasil pembacaan.");
      return JSON.parse(response.output_text) as Result;
    }
    const primary = process.env.OPENAI_MODEL || "gpt-5.4-mini",
      fallback = process.env.OPENAI_FALLBACK_MODEL || "gpt-5.4";
    let result = await read(primary),
      fallbackUsed = false;
    if (suspicious(result) && fallback && fallback !== primary) {
      result = await read(fallback);
      fallbackUsed = true;
    }
    if (!result.ownerName?.trim() || !result.certificateNumber?.trim())
      return NextResponse.json(
        {
          error:
            "OpenAI tidak berhasil menemukan Nama pemilik dan Nomor Sertifikat. Silakan isi manual melalui Preview.",
          code: "OPENAI_EMPTY_RESULT",
        },
        { status: 422 },
      );
    return NextResponse.json({
      ...result,
      modelUsed: fallbackUsed ? fallback : primary,
      fallbackUsed,
    });
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    if (e.status === 429)
      return NextResponse.json(
        {
          error:
            "Kuota atau batas penggunaan OpenAI sudah tercapai. Data masih bisa diisi manual melalui Preview.",
          code: "OPENAI_QUOTA_EXCEEDED",
        },
        { status: 429 },
      );
    if (e.status === 401)
      return NextResponse.json(
        { error: "OpenAI API key tidak valid.", code: "OPENAI_INVALID_KEY" },
        { status: 503 },
      );
    if (e.code === "ETIMEDOUT" || e.code === "ECONNABORTED")
      return NextResponse.json(
        {
          error:
            "OpenAI terlalu lama merespons. Silakan isi manual atau coba lagi.",
          code: "OPENAI_TIMEOUT",
        },
        { status: 504 },
      );
    return NextResponse.json(
      {
        error: e.message || "OpenAI gagal membaca dokumen.",
        code: "OPENAI_ERROR",
      },
      { status: 502 },
    );
  }
}
