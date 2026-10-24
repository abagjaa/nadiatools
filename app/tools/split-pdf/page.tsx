"use client";
import Link from "next/link";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { useMemo, useState } from "react";
import PdfPreviewModal from "../../components/PdfPreviewModal";
import FilenamePattern, {
  type FilenamePart,
} from "../../components/FilenamePattern";
import {
  certificateStartsAmbiguous,
  formatCertificateNumber,
  parseCertificateText,
  pdfTextItems,
} from "../../lib/certificate-parser";

type Provider = "gemini" | "openai";
type Output = {
  name: string;
  bytes: Uint8Array;
  pages: string;
  certificate: string;
  owner: string;
  source: "digital" | Provider | "manual" | "";
  error?: string;
};
type ProcessProgress = {
  phase: "opening" | "splitting" | "reading" | "finalizing";
  current: number;
  total: number;
  message: string;
};
type WritableFile = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};
type FolderHandle = {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ createWritable(): Promise<WritableFile> }>;
};
const clean = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState<"pages" | "ranges">("pages"),
    [ranges, setRanges] = useState("1-2, 3-4"),
    [provider, setProvider] = useState<Provider>("openai"),
    [outputs, setOutputs] = useState<Output[]>([]),
    [nameOrder, setNameOrder] = useState<FilenamePart[]>([
      "certificate",
      "owner",
    ]),
    [nameSeparator, setNameSeparator] = useState("_"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<ProcessProgress | null>(null),
    [savingFolder, setSavingFolder] = useState(false),
    [retrying, setRetrying] = useState<number | null>(null),
    [error, setError] = useState(""),
    [previewItem, setPreviewItem] = useState<{
      data: BlobPart;
      filename: string;
      outputIndex?: number;
    } | null>(null);
  const size = useMemo(
    () => (file ? `${(file.size / 1048576).toFixed(2)} MB` : ""),
    [file],
  );
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
    setOutputs((all) =>
      all.map((output) =>
        output.certificate && output.owner
          ? {
              ...output,
              name: outputName(
                output.certificate,
                output.owner,
                order,
                separator,
              ),
            }
          : output,
      ),
    );
  }
  function choose(f?: File) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
      return setError("Pilih file dengan format PDF.");
    setFile(f);
    setOutputs([]);
    setError("");
  }
  function parseRanges(total: number) {
    const chunks = ranges
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!chunks.length)
      throw new Error("Masukkan sedikitnya satu rentang halaman.");
    return chunks.map((chunk) => {
      const m = chunk.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error(`Rentang “${chunk}” tidak valid.`);
      const a = Number(m[1]),
        b = Number(m[2] || m[1]);
      if (a < 1 || b < a || b > total)
        throw new Error(`Rentang “${chunk}” di luar jumlah halaman.`);
      return Array.from({ length: b - a + 1 }, (_, i) => a + i - 1);
    });
  }
  async function readDigital(file: File) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
      .promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      text +=
        pdfTextItems(
          content.items as Array<{ str?: string; hasEOL?: boolean }>,
        ) + "\n";
    }
    doc.cleanup();
    return text;
  }
  async function readWithAI(file: File) {
    const selectedProvider = provider;
    for (let attempt = 0; attempt < 3; attempt++) {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/${selectedProvider}/extract-certificate`,
        { method: "POST", body: form },
      );
      const data = (await response.json()) as {
        error?: unknown;
        code?: string;
        ownerName?: string;
        certificateNumber?: string;
      };
      if (response.ok) return data;

      const retryable =
        selectedProvider === "gemini" &&
        (response.status === 503 || data.code === "GEMINI_UNAVAILABLE");
      if (retryable && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 1200 : 2500),
        );
        continue;
      }

      const providerName = selectedProvider === "gemini" ? "Gemini" : "OpenAI";
      const rawError = typeof data.error === "string" ? data.error : "";
      const friendlyError = /high demand|unavailable|temporar|503/i.test(
        rawError,
      )
        ? "Gemini sedang sibuk. Coba lagi beberapa saat, pilih OpenAI, atau isi manual melalui Preview."
        : rawError || `${providerName} gagal membaca file.`;
      throw new Error(friendlyError);
    }
    throw new Error("AI gagal membaca file setelah beberapa percobaan.");
  }
  async function identify(output: Output, fallbackName: string) {
    const splitFile = new File([output.bytes as BlobPart], fallbackName, {
      type: "application/pdf",
    });
    try {
      const text = await readDigital(splitFile);
      const parsed = parseCertificateText(text);
      let owner = parsed.owner,
        certificate = parsed.certificate,
        source: Output["source"] = "digital";
      if (!owner || !certificate) {
        const ai = await readWithAI(splitFile);
        owner = ai.ownerName || "";
        certificate = ai.certificateNumber || "";
        source = provider;
      }
      owner = clean(owner).toUpperCase();
      certificate = formatCertificateNumber(clean(certificate));
      if (!owner || !certificate)
        throw new Error("Nomor Sertifikat atau Nama Pemilik tidak ditemukan.");
      return {
        ...output,
        owner,
        certificate,
        source,
        name: outputName(certificate, owner),
      };
    } catch (reason) {
      return {
        ...output,
        error:
          reason instanceof Error
            ? reason.message
            : "Data sertifikat tidak ditemukan.",
      };
    }
  }
  async function process() {
    if (!file) return;
    setBusy(true);
    setError("");
    setProgress({
      phase: "opening",
      current: 0,
      total: 1,
      message: "Membuka dan memeriksa dokumen…",
    });
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const total = source.getPageCount();
      const groups =
        mode === "pages"
          ? Array.from({ length: total }, (_, i) => [i])
          : parseRanges(total);
      const base = file.name.replace(/\.pdf$/i, "");
      const made: Output[] = [];
      setProgress({
        phase: "splitting",
        current: 0,
        total: groups.length,
        message: "Memisahkan PDF sesuai halaman…",
      });
      for (let i = 0; i < groups.length; i++) {
        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(source, groups[i]);
        copied.forEach((p) => doc.addPage(p));
        const label =
          groups[i].length === 1
            ? `halaman-${groups[i][0] + 1}`
            : `halaman-${groups[i][0] + 1}-${groups[i].at(-1)! + 1}`;
        made.push({
          name: `${base}_${label}.pdf`,
          bytes: await doc.save(),
          pages: groups[i].map((n) => n + 1).join(", "),
          certificate: "",
          owner: "",
          source: "",
        });
        setProgress({
          phase: "splitting",
          current: i + 1,
          total: groups.length,
          message: `Membuat file ${i + 1} dari ${groups.length}…`,
        });
      }
      let next = 0;
      let completed = 0;
      const identified = [...made];
      setProgress({
        phase: "reading",
        current: 0,
        total: made.length,
        message: `Membaca sertifikat dengan ${provider === "gemini" ? "Gemini" : "OpenAI"}…`,
      });
      async function worker() {
        while (next < made.length) {
          const index = next++;
          identified[index] = await identify(made[index], made[index].name);
          completed += 1;
          setProgress({
            phase: "reading",
            current: completed,
            total: made.length,
            message: `Memeriksa nama file ${completed} dari ${made.length}…`,
          });
        }
      }
      await Promise.all(
        Array.from(
          {
            length: Math.min(provider === "gemini" ? 2 : 4, made.length),
          },
          () => worker(),
        ),
      );
      setProgress({
        phase: "finalizing",
        current: made.length,
        total: made.length,
        message: "Menyiapkan hasil untuk diperiksa…",
      });
      setOutputs(identified);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF gagal diproses.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  async function retryOutput(index: number) {
    const current = outputs[index];
    if (!current) return;
    setRetrying(index);
    try {
      const result = await identify(
        { ...current, error: undefined },
        current.name,
      );
      setOutputs((all) =>
        all.map((output, currentIndex) =>
          currentIndex === index ? result : output,
        ),
      );
    } finally {
      setRetrying(null);
    }
  }
  function download(o: Output) {
    const blob = new Blob([o.bytes as BlobPart], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = o.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadEntries() {
    const used = new Map<string, number>();
    return outputs.map((output) => {
      const key = output.name.toLocaleLowerCase("id-ID");
      const occurrence = (used.get(key) || 0) + 1;
      used.set(key, occurrence);
      if (occurrence === 1) return { ...output, downloadName: output.name };
      const extensionIndex = output.name.toLowerCase().lastIndexOf(".pdf");
      const base =
        extensionIndex >= 0
          ? output.name.slice(0, extensionIndex)
          : output.name;
      return { ...output, downloadName: `${base} (${occurrence}).pdf` };
    });
  }
  async function zip() {
    const z = new JSZip();
    downloadEntries().forEach((output) =>
      z.file(output.downloadName, output.bytes),
    );
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, "") || "hasil"}_dipisahkan.zip`;
    a.click();
  }
  function downloadConfirmed() {
    const confirmation = document.getElementById(
      "confirmed",
    ) as HTMLInputElement;
    if (!confirmation?.checked) {
      setError("Centang konfirmasi sebelum mengunduh.");
      return false;
    }
    return true;
  }
  async function folder() {
    if (!downloadConfirmed()) return;
    const browserWindow = window as typeof window & {
      showDirectoryPicker?: () => Promise<FolderHandle>;
    };
    if (!browserWindow.showDirectoryPicker) {
      setError(
        "Download Folder belum didukung browser ini. Gunakan Chrome desktop terbaru atau Download ZIP.",
      );
      return;
    }
    setSavingFolder(true);
    setError("");
    try {
      const directory = await browserWindow.showDirectoryPicker();
      for (const output of downloadEntries()) {
        const handle = await directory.getFileHandle(output.downloadName, {
          create: true,
        });
        const writable = await handle.createWritable();
        await writable.write(
          new Blob([output.bytes as BlobPart], { type: "application/pdf" }),
        );
        await writable.close();
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setError(
        "Folder tidak dapat disimpan. Coba pilih folder lain atau gunakan ZIP.",
      );
    } finally {
      setSavingFolder(false);
    }
  }
  function updateOutput(
    index: number,
    field: "certificate" | "owner" | "output",
    value: string,
  ) {
    setOutputs((all) =>
      all.map((output, current) => {
        if (current !== index) return output;
        const formatted =
          field === "certificate"
            ? formatCertificateNumber(value)
            : field === "owner"
              ? value.toUpperCase()
              : value;
        const updated = { ...output, [field]: formatted };
        if (field === "certificate" || field === "owner")
          updated.name = outputName(updated.certificate, updated.owner);
        if (updated.certificate && updated.owner) {
          updated.source = "manual";
          updated.error = "";
        }
        return updated;
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
          <small>PDF TOOL</small>
          <h1>Pisahkan PDF</h1>
          <p>Pisahkan dokumen per halaman atau rentang yang Anda tentukan.</p>
        </div>
        <div className="stepPill">
          {outputs.length ? "3 · REVIEW" : file ? "2 · ATUR" : "1 · UNGGAH"}
        </div>
      </header>
      <main className="toolContent">
        {!outputs.length ? (
          <>
            <section
              className={"drop " + (file ? "hasFile" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                choose(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => choose(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <div className="fileBadge">PDF</div>
                  <div>
                    <b>{file.name}</b>
                    <span>{size} · Siap diproses</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setPreviewItem({ data: file, filename: file.name });
                    }}
                  >
                    Preview
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                    }}
                  >
                    Ganti
                  </button>
                </>
              ) : (
                <>
                  <div className="uploadIcon">↑</div>
                  <h2>Letakkan PDF di sini</h2>
                  <p>atau klik untuk memilih file dari perangkat</p>
                  <span>Maksimum 200 MB</span>
                </>
              )}
            </section>
            {file && (
              <section className="splitSettings">
                <div className="settingsHead">
                  <div>
                    <small>METODE PEMISAHAN</small>
                    <h2>Bagaimana PDF akan dipisahkan?</h2>
                  </div>
                </div>
                <div className="modeGrid">
                  <button
                    className={mode === "pages" ? "selected" : ""}
                    onClick={() => setMode("pages")}
                  >
                    <span>▤</span>
                    <div>
                      <b>Setiap halaman</b>
                      <small>Satu PDF untuk setiap halaman</small>
                    </div>
                    <i>✓</i>
                  </button>
                  <button
                    className={mode === "ranges" ? "selected" : ""}
                    onClick={() => setMode("ranges")}
                  >
                    <span>↔</span>
                    <div>
                      <b>Rentang halaman</b>
                      <small>Tentukan kelompok halaman sendiri</small>
                    </div>
                    <i>✓</i>
                  </button>
                </div>
                {mode === "ranges" && (
                  <label className="rangeInput">
                    <span>Rentang halaman</span>
                    <input
                      value={ranges}
                      onChange={(e) => setRanges(e.target.value)}
                      placeholder="Contoh: 1-2, 3-5, 6"
                    />
                    <small>Pisahkan kelompok dengan koma.</small>
                  </label>
                )}
                <section className="aiChoice">
                  <div>
                    <small>PEMBACA SERTIFIKAT</small>
                    <b>Pilih AI untuk dokumen scan</b>
                    <span>
                      PDF teks digital tetap dibaca langsung tanpa AI.
                    </span>
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
                <div className="toolActions">
                  <Link href="/dashboard">Batal</Link>
                  <button className="button" onClick={process} disabled={busy}>
                    {busy ? "Memproses…" : "Proses dan review →"}
                  </button>
                </div>
                {busy && progress && (
                  <div
                    className="processProgress"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="processIllustration" aria-hidden="true">
                      <span className="processPaper backPaper" />
                      <span className="processPaper frontPaper">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="scanLine" />
                      <b>
                        {Math.round((progress.current / progress.total) * 100)}%
                      </b>
                    </div>
                    <div className="processCopy">
                      <small>PROSES SEDANG BERJALAN</small>
                      <strong>{progress.message}</strong>
                      <span>
                        {progress.phase === "opening"
                          ? "Menyiapkan dokumen"
                          : `${progress.current} dari ${progress.total} selesai`}
                      </span>
                      <div className="progressTrack">
                        <i
                          style={{
                            width: `${Math.max(4, (progress.current / progress.total) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="review">
            <div className="reviewHead">
              <div>
                <small>REVIEW HASIL</small>
                <h2>Periksa sebelum mengunduh</h2>
                <p>
                  {outputs.length} file berhasil dibuat dan diberi nama dari isi
                  sertifikat. Periksa hasil sebelum mengunduh.
                </p>
              </div>
              <button className="secondary" onClick={() => setOutputs([])}>
                ← Ubah pengaturan
              </button>
            </div>
            <FilenamePattern
              order={nameOrder}
              separator={nameSeparator}
              onChange={changeNamePattern}
            />
            <div className="outputList">
              {outputs.map((o, i) => (
                <article key={i}>
                  <div className="pagePreview">{i + 1}</div>
                  <div className="outputInfo">
                    <span>HALAMAN {o.pages}</span>
                    <input
                      value={o.name}
                      onChange={(e) =>
                        setOutputs((all) =>
                          all.map((x, n) =>
                            n === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {o.error ? (
                      <div
                        className="outputErrorRow"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <small className="outputError" style={{ flex: 1 }}>
                          ⚠ {o.error}
                        </small>
                        <button
                          className="retryOutput"
                          onClick={() => retryOutput(i)}
                          disabled={retrying !== null}
                          style={{
                            border: 0,
                            background: "transparent",
                            color: "var(--primary)",
                            fontSize: 9,
                            fontWeight: 800,
                            cursor: retrying !== null ? "wait" : "pointer",
                            opacity: retrying !== null ? 0.55 : 1,
                          }}
                        >
                          {retrying === i ? "Mencoba…" : "Coba lagi"}
                        </button>
                      </div>
                    ) : (
                      <small>
                        {o.source === "digital"
                          ? "Teks digital"
                          : o.source === "gemini"
                            ? "Gemini"
                            : o.source === "openai"
                              ? "OpenAI"
                              : "Manual"}
                      </small>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setPreviewItem({
                        data: o.bytes as BlobPart,
                        filename: o.name,
                        outputIndex: i,
                      })
                    }
                    title="Preview PDF"
                  >
                    ◉
                  </button>
                  <button onClick={() => download(o)}>↓</button>
                </article>
              ))}
            </div>
            <div className="confirm">
              <div>
                <b>Sudah memeriksa semua hasil?</b>
                <span>File hanya diunduh setelah konfirmasi Anda.</span>
              </div>
              <label>
                <input type="checkbox" id="confirmed" /> Nama dan pembagian
                halaman sudah benar
              </label>
              <div className="downloadChoices">
                <button
                  className="secondary"
                  onClick={folder}
                  disabled={savingFolder}
                >
                  {savingFolder ? "Menyimpan…" : "Download Folder"}
                </button>
                <button
                  className="button"
                  onClick={() => downloadConfirmed() && zip()}
                >
                  Download ZIP
                </button>
              </div>
            </div>
          </section>
        )}
        {previewItem && (
          <PdfPreviewModal
            data={previewItem.data}
            filename={previewItem.filename}
            onClose={() => setPreviewItem(null)}
            manual={
              previewItem.outputIndex !== undefined &&
              outputs[previewItem.outputIndex]
                ? (() => {
                    const output = outputs[previewItem.outputIndex!];
                    return {
                      certificate: output.certificate,
                      owner: output.owner,
                      nidi: "",
                      output: output.name,
                    };
                  })()
                : undefined
            }
            onManualChange={(field, value) => {
              const index = previewItem.outputIndex;
              if (index === undefined || field === "nidi") return;
              updateOutput(index, field, value);
              const currentOutput = outputs[index];
              const nextFilename =
                field === "output"
                  ? value
                  : outputName(
                      field === "certificate"
                        ? formatCertificateNumber(value)
                        : currentOutput.certificate,
                      field === "owner"
                        ? value.toUpperCase()
                        : currentOutput.owner,
                    );
              setPreviewItem((current) =>
                current ? { ...current, filename: nextFilename } : current,
              );
            }}
            warning={(() => {
              const output =
                previewItem.outputIndex === undefined
                  ? undefined
                  : outputs[previewItem.outputIndex];
              if (output?.error) return output.error;
              if (output && certificateStartsAmbiguous(output.certificate))
                return "Awalan Nomor Sertifikat terbaca I atau 1. Periksa kembali dokumen.";
              return undefined;
            })()}
            position={
              previewItem.outputIndex !== undefined
                ? `${previewItem.outputIndex + 1} dari ${outputs.length}`
                : undefined
            }
            onPrevious={
              previewItem.outputIndex !== undefined &&
              previewItem.outputIndex > 0
                ? () => {
                    const index = previewItem.outputIndex! - 1;
                    const output = outputs[index];
                    setPreviewItem({
                      data: output.bytes as BlobPart,
                      filename: output.name,
                      outputIndex: index,
                    });
                  }
                : undefined
            }
            onNext={
              previewItem.outputIndex !== undefined &&
              previewItem.outputIndex < outputs.length - 1
                ? () => {
                    const index = previewItem.outputIndex! + 1;
                    const output = outputs[index];
                    setPreviewItem({
                      data: output.bytes as BlobPart,
                      filename: output.name,
                      outputIndex: index,
                    });
                  }
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
