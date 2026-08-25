"use client";
import Link from "next/link";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { useMemo, useState } from "react";
import PdfPreviewModal from "../../components/PdfPreviewModal";

type Output = { name: string; bytes: Uint8Array; pages: string };
export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState<"pages" | "ranges">("pages"),
    [ranges, setRanges] = useState("1-2, 3-4"),
    [outputs, setOutputs] = useState<Output[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewItem, setPreviewItem] = useState<{
      data: BlobPart;
      filename: string;
    } | null>(null);
  const size = useMemo(
    () => (file ? `${(file.size / 1048576).toFixed(2)} MB` : ""),
    [file],
  );
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
  async function process() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const total = source.getPageCount();
      const groups =
        mode === "pages"
          ? Array.from({ length: total }, (_, i) => [i])
          : parseRanges(total);
      const base = file.name.replace(/\.pdf$/i, "");
      const made: Output[] = [];
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
        });
      }
      setOutputs(made);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF gagal diproses.");
    } finally {
      setBusy(false);
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
  async function zip() {
    const z = new JSZip();
    outputs.forEach((o) => z.file(o.name, o.bytes));
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name.replace(/\.pdf$/i, "") || "hasil"}_dipisahkan.zip`;
    a.click();
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
                <div className="toolActions">
                  <Link href="/dashboard">Batal</Link>
                  <button className="button" onClick={process} disabled={busy}>
                    {busy ? "Memproses…" : "Proses dan review →"}
                  </button>
                </div>
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
                  {outputs.length} file berhasil dibuat. Anda dapat memperbaiki
                  nama file.
                </p>
              </div>
              <button className="secondary" onClick={() => setOutputs([])}>
                ← Ubah pengaturan
              </button>
            </div>
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
                  </div>
                  <button
                    onClick={() =>
                      setPreviewItem({
                        data: o.bytes as BlobPart,
                        filename: o.name,
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
              <button
                className="button"
                onClick={() => {
                  const c = document.getElementById(
                    "confirmed",
                  ) as HTMLInputElement;
                  if (c?.checked) zip();
                  else setError("Centang konfirmasi sebelum mengunduh.");
                }}
              >
                Download ZIP
              </button>
            </div>
          </section>
        )}
        {previewItem && (
          <PdfPreviewModal
            data={previewItem.data}
            filename={previewItem.filename}
            onClose={() => setPreviewItem(null)}
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
