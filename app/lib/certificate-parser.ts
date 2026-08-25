export type CertificateFields = {
  owner: string;
  certificate: string;
  nidi: string;
};

const valueToken = "([A-Z0-9][A-Z0-9.\\/-]*)";

function first(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

export function parseCertificateText(raw: string): CertificateFields {
  const text = raw
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  const certificate = first(
    text,
    new RegExp(`Nomor\\s+Sertifikat\\s*:?\\s*${valueToken}`, "i"),
  );
  const owner = first(
    text,
    /Nama\s+pemilik\s*:?\s*(.+?)(?=\s+(?:Nomor\s+Identitas\s+Instalasi\s+Tenaga\s+Listrik|NIDI\b|Alamat\s+pemilik|Titik\s+Koordinat|Daya\s+tersambung|Sistem\s+Pembumian)\s*[:(])/i,
  );
  const nidi = first(
    text,
    new RegExp(
      `(?:Nomor\\s+Identitas\\s+Instalasi\\s+Tenaga\\s+Listrik(?:\\s*\\(NIDI\\))?|NIDI)\\s*:?\\s*${valueToken}`,
      "i",
    ),
  );
  return { owner, certificate, nidi };
}

export function pdfTextItems(items: Array<{ str?: string; hasEOL?: boolean }>) {
  return items
    .map((item) => (item.str || "") + (item.hasEOL ? "\n" : " "))
    .join("");
}

export function formatCertificateNumber(value: string) {
  const raw = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 17),
    lengths = [4, 1, 1, 1, 3, 4, 3];
  const parts: string[] = [];
  let offset = 0;
  for (const length of lengths) {
    const part = raw.slice(offset, offset + length);
    if (!part) break;
    parts.push(part);
    offset += length;
  }
  return parts.join(".");
}

export function certificateStartsAmbiguous(value: string) {
  return /^[I1]/i.test(value.trim());
}
