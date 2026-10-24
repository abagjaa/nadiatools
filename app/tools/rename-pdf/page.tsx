"use client";
import Link from "next/link";
import JSZip from "jszip";
import { useRef, useState } from "react";
import PdfPreviewModal from "../../components/PdfPreviewModal";
import FilenamePattern, {
  type FilenamePart,
} from "../../components/FilenamePattern";
import {
  parseCertificateText,
  pdfTextItems,
  formatCertificateNumber,
  certificateStartsAmbiguous,
} from "../../lib/certificate-parser";
type Provider = "gemini" | "openai";
type Row = {
  id: string;
  file: File;
  owner: string;
  certificate: string;
  nidi: string;
  type: string;
  confidence: number;
  source: "digital" | Provider | "manual" | "";
  status: "queued" | "processing" | "ready" | "failed";
  error?: string;
  output: string;
};
const clean = (v: string) =>
  v
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export default function RenamePdf() {
  const [rows, setRows] = useState<Row[]>([]),
    [provider, setProvider] = useState<Provider>("openai"),
    [busy, setBusy] = useState(false),
    [nameOrder, setNameOrder] = useState<FilenamePart[]>([
      "certificate",
      "owner",
    ]),
    [nameSeparator, setNameSeparator] = useState("_"),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [previewId, setPreviewId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  function outputName(
    certificate: string,
    owner: string,
    order = nameOrder,
    separator = nameSeparator,
  ) {
    const values: Record<FilenamePart, string> = { certificate, owner };
    return (
      clean(
        order
          .map((part) => values[part])
          .filter(Boolean)
          .join(separator),
      ) + ".pdf"
    );
  }
  function changeNamePattern(order: FilenamePart[], separator: string) {
    setNameOrder(order);
    setNameSeparator(separator);
    setRows((all) =>
      all.map((row) =>
        order.every((part) =>
          part === "certificate" ? row.certificate : row.owner,
        )
          ? {
              ...row,
              output: outputName(row.certificate, row.owner, order, separator),
            }
          : row,
      ),
    );
  }
  function add(files: File[]) {
    const pdfs = files.filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setRows((old) => [
      ...old,
      ...pdfs.map((file): Row => ({
        id: crypto.randomUUID(),
        file,
        owner: "",
        certificate: "",
        nidi: "",
        type: "",
        confidence: 0,
        source: "",
        status: "queued",
        output: file.name,
      })),
    ]);
    setConfirmed(false);
  }
  async function addZip(file: File) {
    try {
      const zip = await JSZip.loadAsync(file);
      const made: File[] = [];
      for (const [name, entry] of Object.entries(zip.files)) {
        if (!entry.dir && name.toLowerCase().endsWith(".pdf"))
          made.push(
            new File(
              [await entry.async("blob")],
              name.split("/").pop() || name,
              { type: "application/pdf" },
            ),
          );
      }
      add(made);
    } catch {
      setError("ZIP tidak dapat dibaca.");
    }
  }
  async function readDigital(file: File) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
      .promise;
    let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        pdfTextItems(
          content.items as Array<{ str?: string; hasEOL?: boolean }>,
        ) + "\n";
    }
    return text;
  }
  async function readWithAI(file: File, signal: AbortSignal) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/${provider}/extract-certificate`, {
      method: "POST",
      body: form,
      signal,
    });
    const data = (await response.json()) as {
      error?: string;
      ownerName?: string;
      certificateNumber?: string;
      nidi?: string;
      documentType?: string;
      confidence?: number;
    };
    if (!response.ok)
      throw new Error(
        data.error ||
          `${provider === "gemini" ? "Gemini" : "OpenAI"} gagal membaca file.`,
      );
    return data;
  }
  async function process(ids?: string[]) {
    const targets = rows.filter((r) =>
      ids ? ids.includes(r.id) : r.status === "queued" || r.status === "failed",
    );
    if (!targets.length) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    let next = 0;
    async function worker() {
      while (!controller.signal.aborted) {
        const target = targets[next++];
        if (!target) return;
        setRows((old) =>
          old.map((r) =>
            r.id === target.id ? { ...r, status: "processing", error: "" } : r,
          ),
        );
        try {
          const text = await readDigital(target.file);
          let data: any, source: "digital" | Provider;
          const parsed = parseCertificateText(text);
          if (text.trim().length > 80 && parsed.owner && parsed.certificate) {
            data = {
              ownerName: parsed.owner,
              certificateNumber: parsed.certificate,
              nidi: parsed.nidi,
              documentType: "SLO",
              confidence: 0.96,
            };
            source = "digital";
          } else {
            data = await readWithAI(target.file, controller.signal);
            source = provider;
          }
          const owner = clean(data.ownerName || "").toUpperCase(),
            certificate = formatCertificateNumber(
              clean(data.certificateNumber || ""),
            );
          if (!owner || !certificate)
            throw new Error(
              `${provider === "gemini" ? "Gemini" : "OpenAI"} tidak menemukan Nama pemilik atau Nomor Sertifikat.`,
            );
          const output = outputName(certificate, owner);
          setRows((old) =>
            old.map((r) =>
              r.id === target.id
                ? {
                    ...r,
                    owner,
                    certificate,
                    nidi: clean(data.nidi || ""),
                    type: data.documentType || "UNKNOWN",
                    confidence: Number(data.confidence) || 0,
                    source,
                    status: "ready",
                    output,
                  }
                : r,
            ),
          );
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          setRows((old) =>
            old.map((r) =>
              r.id === target.id
                ? {
                    ...r,
                    status: "failed",
                    error: e instanceof Error ? e.message : "Gagal diproses.",
                  }
                : r,
            ),
          );
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, targets.length) }, () => worker()),
    );
    setBusy(false);
  }
  function save(row: Row) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(row.file);
    a.download = row.output;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function zip() {
    if (!confirmed) return setError("Konfirmasi hasil sebelum mengunduh.");
    const ready = rows.filter((r) => r.status === "ready");
    const z = new JSZip();
    ready.forEach((r) => z.file(r.output, r.file));
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "PDF_Sudah_Direnaming.zip";
    a.click();
  }
  async function folder() {
    if (!confirmed) return setError("Konfirmasi hasil sebelum mengunduh.");
    const picker = (window as any).showDirectoryPicker;
    if (!picker)
      return setError(
        "Browser ini belum mendukung simpan langsung ke folder. Gunakan Download ZIP.",
      );
    try {
      const dir = await picker();
      for (const row of rows.filter((r) => r.status === "ready")) {
        const handle = await dir.getFileHandle(row.output, { create: true });
        const writer = await handle.createWritable();
        await writer.write(row.file);
        await writer.close();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Gagal menyimpan ke folder.");
    }
  }
  const previewIndex = rows.findIndex((row) => row.id === previewId);
  const previewRow = previewIndex >= 0 ? rows[previewIndex] : null;
  function updateManual(
    field: "certificate" | "owner" | "nidi" | "output",
    value: string,
  ) {
    if (!previewId) return;
    const formatted =
      field === "certificate"
        ? formatCertificateNumber(value)
        : field === "owner"
          ? value.toUpperCase()
          : value;
    setRows((old) =>
      old.map((row) => {
        if (row.id !== previewId) return row;
        const next = { ...row, [field]: formatted };
        if (field === "certificate" || field === "owner")
          next.output = outputName(next.certificate, next.owner);
        if (
          nameOrder.every((part) =>
            part === "certificate"
              ? next.certificate.trim()
              : next.owner.trim(),
          )
        ) {
          next.status = "ready";
          next.source = "manual";
          next.confidence = 1;
          next.error = "";
        }
        return next;
      }),
    );
  }
  return (
    <div className="toolPage">
      <header className="toolHeader">
        <Link href="/dashboard" className="backButton">
          ←
        </Link>
        <div>
          <small>PDF + AI</small>
          <h1>Rename PDF</h1>
          <p>Baca sertifikat, periksa hasil, lalu rapikan semua nama file.</p>
        </div>
        <div className="stepPill">
          {rows.some((r) => r.status === "ready")
            ? "3 · REVIEW"
            : rows.length
              ? "2 · PROSES"
              : "1 · UNGGAH"}
        </div>
      </header>
      <main className="toolContent renameContent">
        <section className="renameSources">
          <label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) =>
                e.target.files && add(Array.from(e.target.files))
              }
            />
            <b>＋ PDF</b>
            <span>Pilih satu atau banyak file</span>
          </label>
          <label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => e.target.files?.[0] && addZip(e.target.files[0])}
            />
            <b>▣ ZIP</b>
            <span>Ambil semua PDF dalam ZIP</span>
          </label>
          <label
            onClick={() => {
              folderRef.current?.setAttribute("webkitdirectory", "");
              folderRef.current?.click();
            }}
          >
            <input
              ref={folderRef}
              type="file"
              multiple
              hidden
              onChange={(e) =>
                e.target.files && add(Array.from(e.target.files))
              }
            />
            <b>□ Folder</b>
            <span>Pilih satu folder PDF</span>
          </label>
        </section>
        {rows.length > 0 && !rows.some((r) => r.status === "ready") && (
          <section className="aiChoice">
            <div>
              <small>PEMBACA DOKUMEN SCAN</small>
              <b>Pilih AI sebelum eksekusi</b>
              <span>PDF teks digital tetap dibaca langsung tanpa AI.</span>
            </div>
            <div>
              <button
                className={provider === "gemini" ? "active" : ""}
                onClick={() => setProvider("gemini")}
                disabled={busy}
              >
                Gemini
              </button>
              <button
                className={provider === "openai" ? "active" : ""}
                onClick={() => setProvider("openai")}
                disabled={busy}
              >
                OpenAI
              </button>
            </div>
          </section>
        )}
        {rows.length > 0 && (
          <section className="renamePanel">
            <div className="reviewHead">
              <div>
                <small>DAFTAR FILE</small>
                <h2>{rows.length} dokumen siap dikerjakan</h2>
                <p>
                  PDF digital dibaca langsung. Scan dan foto diproses melalui{" "}
                  {provider === "gemini" ? "Gemini" : "OpenAI"}.
                </p>
              </div>
              {busy ? (
                <button
                  className="secondary danger"
                  onClick={() => abort.current?.abort()}
                >
                  Hentikan proses
                </button>
              ) : (
                <button
                  className="button"
                  onClick={() => process()}
                  disabled={
                    !rows.some(
                      (r) => r.status === "queued" || r.status === "failed",
                    )
                  }
                >
                  Mulai proses →
                </button>
              )}
            </div>
            {rows.some((row) => row.status === "ready") && (
              <FilenamePattern
                order={nameOrder}
                separator={nameSeparator}
                onChange={changeNamePattern}
              />
            )}
            <div className="renameTable">
              {rows.map((row) => (
                <article key={row.id} className={"renameRow " + row.status}>
                  <div className="renameStatus">
                    {row.status === "processing"
                      ? "…"
                      : row.status === "ready"
                        ? "✓"
                        : row.status === "failed"
                          ? "!"
                          : "PDF"}
                  </div>
                  <div className="renameData">
                    <b>{row.file.name}</b>
                    {row.status === "ready" ? (
                      <>
                        <label className="filenameField">
                          Nama hasil
                          <input
                            value={row.output}
                            onChange={(e) =>
                              setRows((old) =>
                                old.map((r) =>
                                  r.id === row.id
                                    ? { ...r, output: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                        <span>
                          {row.source === "manual"
                            ? "Manual"
                            : row.source === "gemini"
                              ? "Gemini"
                              : row.source === "openai"
                                ? "OpenAI"
                                : "Teks digital"}{" "}
                          · Keyakinan {Math.round(row.confidence * 100)}%
                        </span>
                        {certificateStartsAmbiguous(row.certificate) && (
                          <span className="certificateWarning">
                            ⚠ Awalan I/1 perlu diperiksa kembali
                          </span>
                        )}
                      </>
                    ) : (
                      <span>
                        {row.error ||
                          (
                            {
                              queued: "Menunggu diproses",
                              processing: "Sedang membaca dokumen",
                              failed: "Gagal diproses",
                            } as any
                          )[row.status]}
                      </span>
                    )}
                  </div>
                  <div className="rowButtons">
                    {row.status === "failed" && (
                      <button onClick={() => process([row.id])}>
                        Coba lagi
                      </button>
                    )}
                    <button
                      onClick={() => setPreviewId(row.id)}
                      title="Preview PDF"
                    >
                      Preview
                    </button>
                    {row.status === "ready" && (
                      <button onClick={() => save(row)}>↓</button>
                    )}
                    <button
                      onClick={() =>
                        setRows((old) => old.filter((r) => r.id !== row.id))
                      }
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {rows.some((r) => r.status === "ready") && (
              <div className="downloadBar">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  Saya sudah memeriksa nama dan hasil pembacaan
                </label>
                <div>
                  <button className="secondary" onClick={folder}>
                    Simpan ke folder
                  </button>
                  <button className="button" onClick={zip}>
                    Download ZIP
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        {previewRow && (
          <PdfPreviewModal
            data={previewRow.file}
            filename={previewRow.output}
            onClose={() => setPreviewId(null)}
            manual={{
              certificate: previewRow.certificate,
              owner: previewRow.owner,
              nidi: previewRow.nidi,
              output: previewRow.output,
            }}
            onManualChange={updateManual}
            warning={
              certificateStartsAmbiguous(previewRow.certificate)
                ? "Nomor sertifikat diawali I atau 1. Periksa langsung pada dokumen karena kedua karakter mudah tertukar."
                : undefined
            }
            position={`${previewIndex + 1} dari ${rows.length}`}
            onPrevious={
              previewIndex > 0
                ? () => setPreviewId(rows[previewIndex - 1].id)
                : undefined
            }
            onNext={
              previewIndex < rows.length - 1
                ? () => setPreviewId(rows[previewIndex + 1].id)
                : undefined
            }
          />
        )}
        {error && (
          <div className="toast">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
      </main>
    </div>
  );
}
