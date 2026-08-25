"use client";
import Link from "next/link";
import JSZip from "jszip";
import { useRef, useState } from "react";
import PdfPreviewModal from "../../components/PdfPreviewModal";
import {
  parseCertificateText,
  pdfTextItems,
  formatCertificateNumber,
  certificateStartsAmbiguous,
} from "../../lib/certificate-parser";
type Provider = "gemini" | "openai";
type TemplateRow = { row: number; name: string };
type Result = {
  id: string;
  file: File;
  owner: string;
  slo: string;
  nidi: string;
  confidence: number;
  source: string;
  matchedRow: number | null;
  candidate: string;
  skip: boolean;
  error?: string;
};
const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/\b(pt|cv)\.?\s*/g, "")
    .replace(/[^a-z0-9]/g, "");
function distance(a: string, b: string) {
  const m = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0];
    m[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = m[j];
      m[j] = Math.min(
        m[j] + 1,
        m[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = t;
    }
  }
  return m[b.length];
}
function similarity(a: string, b: string) {
  const x = norm(a),
    y = norm(b);
  return x && y ? 1 - distance(x, y) / Math.max(x.length, y.length) : 0;
}
export default function Extractor() {
  const [excel, setExcel] = useState<File | null>(null),
    [pdfs, setPdfs] = useState<File[]>([]),
    [provider, setProvider] = useState<Provider>("openai"),
    [templateRows, setTemplateRows] = useState<TemplateRow[]>([]),
    [header, setHeader] = useState({ row: 1, name: 1, slo: 0, nidi: 0 }),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"new" | "template">("template"),
    [confirmed, setConfirmed] = useState(false),
    [previewId, setPreviewId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null),
    folder = useRef<HTMLInputElement | null>(null);
  async function loadExcel(file: File) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await file.arrayBuffer()) as any);
      const ws = wb.worksheets[0];
      let hr = 1,
        nc = 0,
        sc = 0,
        ic = 0;
      for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
        ws.getRow(r).eachCell((cell, c) => {
          const v = String(cell.text || "").toLowerCase();
          if (!nc && /nama/.test(v)) nc = c;
          if (!sc && /(nomor\s*)?slo/.test(v)) sc = c;
          if (!ic && /nidi/.test(v)) ic = c;
        });
        if (nc) {
          hr = r;
          break;
        }
      }
      if (!nc) nc = 1;
      const names: TemplateRow[] = [];
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const name = String(ws.getCell(r, nc).text || "").trim();
        if (name) names.push({ row: r, name });
      }
      setExcel(file);
      setTemplateRows(names);
      setHeader({ row: hr, name: nc, slo: sc, nidi: ic });
      setError("");
    } catch {
      setError("Template Excel tidak dapat dibaca.");
    }
  }
  function add(files: File[]) {
    setPdfs((old) => [
      ...old,
      ...files.filter(
        (f) =>
          f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      ),
    ]);
    setConfirmed(false);
  }
  async function addZip(file: File) {
    try {
      const zip = await JSZip.loadAsync(file);
      const out: File[] = [];
      for (const [n, e] of Object.entries(zip.files))
        if (!e.dir && n.toLowerCase().endsWith(".pdf"))
          out.push(
            new File([await e.async("blob")], n.split("/").pop() || n, {
              type: "application/pdf",
            }),
          );
      add(out);
    } catch {
      setError("ZIP tidak dapat dibaca.");
    }
  }
  async function digital(file: File) {
    const p = await import("pdfjs-dist/legacy/build/pdf.mjs");
    p.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await p.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(3, doc.numPages); i++) {
      const page = await doc.getPage(i),
        content = await page.getTextContent();
      text +=
        pdfTextItems(
          content.items as Array<{ str?: string; hasEOL?: boolean }>,
        ) + "\n";
    }
    return text;
  }
  async function extract(file: File, signal: AbortSignal) {
    const text = await digital(file);
    const parsed = parseCertificateText(text);
    if (text.length > 80 && parsed.owner && parsed.certificate)
      return {
        owner: parsed.owner,
        slo: formatCertificateNumber(parsed.certificate),
        nidi: parsed.nidi,
        confidence: 0.96,
        source: "digital",
      };
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/${provider}/extract-certificate`, {
      method: "POST",
      body: form,
      signal,
    });
    const d = (await response.json()) as {
      error?: string;
      ownerName?: string;
      certificateNumber?: string;
      nidi?: string;
      confidence?: number;
    };
    if (!response.ok)
      throw new Error(
        d.error || `${provider === "gemini" ? "Gemini" : "OpenAI"} gagal.`,
      );
    if (!d.ownerName?.trim() || !d.certificateNumber?.trim())
      throw new Error(
        `${provider === "gemini" ? "Gemini" : "OpenAI"} tidak menemukan Nama pemilik atau Nomor Sertifikat.`,
      );
    return {
      owner: String(d.ownerName || "").toUpperCase(),
      slo: formatCertificateNumber(d.certificateNumber || ""),
      nidi: d.nidi || "",
      confidence: Number(d.confidence) || 0,
      source: provider,
    };
  }
  function match(owner: string) {
    const exact = templateRows.filter((x) => norm(x.name) === norm(owner));
    if (exact.length === 1)
      return { row: exact[0].row, candidate: exact[0].name };
    if (exact.length > 1)
      return { row: null, candidate: `${exact.length} baris bernama sama` };
    const ranked = templateRows
      .map((x) => ({ ...x, score: similarity(x.name, owner) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 0.72
      ? { row: null, candidate: ranked[0].name }
      : { row: null, candidate: "" };
  }
  async function run() {
    if (!excel) return setError("Unggah template Excel terlebih dahulu.");
    if (!pdfs.length) return setError("Tambahkan file PDF.");
    setBusy(true);
    setError("");
    setResults([]);
    const controller = new AbortController();
    abort.current = controller;
    const out: Array<Result | undefined> = new Array(pdfs.length);
    let next = 0;
    async function worker() {
      while (!controller.signal.aborted) {
        const index = next++;
        const file = pdfs[index];
        if (!file) return;
        try {
          const d = await extract(file, controller.signal);
          const m = match(d.owner);
          out[index] = {
            id: crypto.randomUUID(),
            file,
            owner: d.owner,
            slo: d.slo,
            nidi: d.nidi,
            confidence: d.confidence,
            source: d.source,
            matchedRow: m.row,
            candidate: m.candidate,
            skip: false,
          };
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          out[index] = {
            id: crypto.randomUUID(),
            file,
            owner: "",
            slo: "",
            nidi: "",
            confidence: 0,
            source: "",
            matchedRow: null,
            candidate: "",
            skip: false,
            error: e instanceof Error ? e.message : "Gagal",
          };
        }
        setResults(out.filter((item): item is Result => Boolean(item)));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, pdfs.length) }, () => worker()),
    );
    setBusy(false);
  }
  async function download() {
    if (!confirmed)
      return setError("Konfirmasi hasil review sebelum download.");
    const ExcelJS = (await import("exceljs")).default;
    let wb: any;
    if (mode === "template" && excel) {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await excel.arrayBuffer()) as any);
      const ws = wb.worksheets[0];
      let sloCol = header.slo,
        nidiCol = header.nidi;
      if (!sloCol) {
        sloCol = ws.columnCount + 1;
        ws.getCell(header.row, sloCol).value = "Nomor SLO";
      }
      if (!nidiCol) {
        nidiCol = Math.max(ws.columnCount, sloCol) + 1;
        ws.getCell(header.row, nidiCol).value = "NIDI";
      }
      for (const r of results.filter((x) => !x.skip)) {
        let row = r.matchedRow;
        if (!row) {
          row = ws.rowCount + 1;
          ws.getCell(row, header.name).value = r.owner;
        }
        ws.getCell(row, sloCol).value = r.slo;
        ws.getCell(row, nidiCol).value = r.nidi;
      }
    } else {
      wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Hasil");
      ws.addRow(["Nama", "Nomor SLO", "NIDI", "Sumber", "Keyakinan"]);
      results
        .filter((x) => !x.skip)
        .forEach((r) =>
          ws.addRow([
            r.owner,
            r.slo,
            r.nidi,
            r.source,
            Math.round(r.confidence * 100) + "%",
          ]),
        );
      ws.columns = [
        { width: 32 },
        { width: 30 },
        { width: 26 },
        { width: 14 },
        { width: 12 },
      ];
    }
    const bytes = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    a.download =
      mode === "template"
        ? "Template_SLO_NIDI_Terisi.xlsx"
        : "Hasil_Extractor_SLO_NIDI.xlsx";
    a.click();
  }
  return (
    <div className="toolPage">
      <header className="toolHeader">
        <Link href="/dashboard" className="backButton">
          ←
        </Link>
        <div>
          <small>PDF + EXCEL + AI</small>
          <h1>SLO & NIDI Extractor</h1>
          <p>Sinkronkan sertifikat dengan baris nama pada Excel.</p>
        </div>
        <div className="stepPill">
          {results.length
            ? "3 · REVIEW"
            : pdfs.length
              ? "2 · PROSES"
              : "1 · UNGGAH"}
        </div>
      </header>
      <main className="toolContent extractorContent">
        <section className="extractInputs">
          <label className={excel ? "loaded" : ""}>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) =>
                e.target.files?.[0] && loadExcel(e.target.files[0])
              }
            />
            <b>{excel ? "✓ " + excel.name : "Unggah template Excel"}</b>
            <span>
              {excel ? `${templateRows.length} nama ditemukan` : "Format .xlsx"}
            </span>
          </label>
          <div className="pdfInput">
            <b>Dokumen sertifikat</b>
            <span>{pdfs.length} PDF ditambahkan</span>
            <div>
              <label>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={(e) =>
                    e.target.files && add(Array.from(e.target.files))
                  }
                />
                ＋ PDF
              </label>
              <label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) =>
                    e.target.files?.[0] && addZip(e.target.files[0])
                  }
                />
                ▣ ZIP
              </label>
              <button
                onClick={() => {
                  folder.current?.setAttribute("webkitdirectory", "");
                  folder.current?.click();
                }}
              >
                □ Folder
              </button>
              <input
                ref={folder}
                hidden
                type="file"
                multiple
                onChange={(e) =>
                  e.target.files && add(Array.from(e.target.files))
                }
              />
            </div>
          </div>
        </section>
        {pdfs.length > 0 && !results.length && (
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
        {pdfs.length > 0 && !results.length && (
          <section className="extractQueue">
            <div>
              <b>{pdfs.length} file siap diproses</b>
              <span>
                Scan memakai {provider === "gemini" ? "Gemini" : "OpenAI"}.
                Pencocokan nama tidak membedakan kapital, tanda baca, atau
                spasi.
              </span>
            </div>
            {busy ? (
              <button
                className="secondary danger"
                onClick={() => abort.current?.abort()}
              >
                Hentikan
              </button>
            ) : (
              <button className="button" onClick={run}>
                Jalankan extractor →
              </button>
            )}
          </section>
        )}
        {results.length > 0 && (
          <section className="extractReview">
            <div className="reviewHead">
              <div>
                <small>REVIEW & KONFIRMASI</small>
                <h2>Periksa sinkronisasi data</h2>
                <p>
                  Data kosong, kandidat nama, dan hasil dengan keyakinan rendah
                  diberi peringatan.
                </p>
              </div>
              <button className="secondary" onClick={() => setResults([])}>
                ← Proses ulang
              </button>
            </div>
            <div className="extractTable">
              <div className="extractTh">
                <span>File / Status</span>
                <span>Preview</span>
                <span>Nama pemilik</span>
                <span>Nomor SLO</span>
                <span>NIDI</span>
              </div>
              {results.map((r) => (
                <article
                  key={r.id}
                  className={
                    r.error || !r.matchedRow || r.confidence < 0.75
                      ? "warning"
                      : ""
                  }
                >
                  <div>
                    <b>{r.file.name}</b>
                    <span>
                      {r.error || r.matchedRow
                        ? `Cocok ke baris ${r.matchedRow}`
                        : r.candidate
                          ? `Kandidat: ${r.candidate}`
                          : "Tidak ditemukan di Excel"}
                    </span>
                    {certificateStartsAmbiguous(r.slo) && (
                      <span className="certificateWarning">
                        ⚠ Awalan I/1 perlu dicek
                      </span>
                    )}
                  </div>
                  <button
                    className="previewButton"
                    onClick={() => setPreviewId(r.id)}
                    title="Preview PDF"
                  >
                    Preview
                  </button>
                  <input
                    value={r.owner}
                    onChange={(e) =>
                      setResults((old) =>
                        old.map((x) =>
                          x.id === r.id
                            ? { ...x, owner: e.target.value.toUpperCase() }
                            : x,
                        ),
                      )
                    }
                  />
                  <input
                    value={r.slo}
                    onChange={(e) =>
                      setResults((old) =>
                        old.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                slo: formatCertificateNumber(e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  <input
                    value={r.nidi}
                    onChange={(e) =>
                      setResults((old) =>
                        old.map((x) =>
                          x.id === r.id ? { ...x, nidi: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={r.skip}
                      onChange={(e) =>
                        setResults((old) =>
                          old.map((x) =>
                            x.id === r.id
                              ? { ...x, skip: e.target.checked }
                              : x,
                          ),
                        )
                      }
                    />{" "}
                    Lewati
                  </label>
                </article>
              ))}
            </div>
            <div className="extractFooter">
              <div className="modeChoice">
                <button
                  className={mode === "template" ? "active" : ""}
                  onClick={() => setMode("template")}
                >
                  Isi template
                </button>
                <button
                  className={mode === "new" ? "active" : ""}
                  onClick={() => setMode("new")}
                >
                  Excel baru
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Data sudah diperiksa
              </label>
              <button className="button" onClick={download}>
                Download Excel →
              </button>
            </div>
          </section>
        )}
        {previewId && results.find((result) => result.id === previewId) && (
          <PdfPreviewModal
            data={results.find((result) => result.id === previewId)!.file}
            filename={
              results.find((result) => result.id === previewId)!.file.name
            }
            onClose={() => setPreviewId(null)}
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
