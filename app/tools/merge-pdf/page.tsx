"use client";
import Link from "next/link";
import { useState } from "react";
import PdfPreviewModal from "../../components/PdfPreviewModal";

type Item = { id: string; file: File; rotation: number };
export default function MergePdf() {
  const [items, setItems] = useState<Item[]>([]),
    [name, setName] = useState("Dokumen_Gabungan.pdf"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [dragged, setDragged] = useState<string | null>(null),
    [previewId, setPreviewId] = useState<string | null>(null);
  function add(files: FileList | File[]) {
    const valid = Array.from(files).filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (!valid.length) return setError("Pilih sedikitnya satu file PDF.");
    setItems((old) => [
      ...old,
      ...valid.map((file) => ({ id: crypto.randomUUID(), file, rotation: 0 })),
    ]);
    setConfirmed(false);
    setError("");
  }
  function move(id: string, to: number) {
    setItems((old) => {
      const from = old.findIndex((x) => x.id === id);
      if (from < 0) return old;
      const next = [...old];
      const [item] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
      return next;
    });
  }
  async function merge() {
    if (items.length < 2)
      return setError("Unggah sedikitnya dua PDF untuk digabungkan.");
    if (!confirmed)
      return setError("Konfirmasi urutan dokumen sebelum mengunduh.");
    setBusy(true);
    setError("");
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const output = await PDFDocument.create();
      for (const item of items) {
        const source = await PDFDocument.load(await item.file.arrayBuffer());
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => {
          if (item.rotation)
            page.setRotation(
              degrees((page.getRotation().angle + item.rotation) % 360),
            );
          output.addPage(page);
        });
      }
      const bytes = await output.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        (name.trim() || "Dokumen_Gabungan.pdf").replace(/\.pdf$/i, "") + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF gagal digabungkan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="toolPage">
      <header className="toolHeader">
        <Link href="/dashboard" className="backButton">
          ←
        </Link>
        <div>
          <small>PDF TOOL</small>
          <h1>Gabungkan PDF</h1>
          <p>Susun beberapa dokumen menjadi satu PDF yang rapi.</p>
        </div>
        <div className="stepPill">
          {items.length ? "2 · REVIEW" : "1 · UNGGAH"}
        </div>
      </header>
      <main className="toolContent mergeContent">
        <section
          className="mergeUpload"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => e.target.files && add(e.target.files)}
          />
          <span>＋</span>
          <div>
            <b>Tambah file PDF</b>
            <small>Pilih beberapa file atau letakkan di sini</small>
          </div>
        </section>
        {items.length > 0 && (
          <section className="mergeReview">
            <div className="reviewHead">
              <div>
                <small>URUTAN DOKUMEN</small>
                <h2>Atur sebelum digabungkan</h2>
                <p>
                  Seret kartu untuk mengubah urutan. Semua file akan menjadi
                  satu PDF.
                </p>
              </div>
              <span className="fileCount">{items.length} FILE</span>
            </div>
            <div className="mergeList">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDragged(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragged) move(dragged, index);
                    setDragged(null);
                  }}
                >
                  <div className="dragHandle">⠿</div>
                  <div className="mergeThumb">
                    <b>PDF</b>
                    <span>{index + 1}</span>
                  </div>
                  <div className="mergeInfo">
                    <b>{item.file.name}</b>
                    <span>
                      {(item.file.size / 1048576).toFixed(2)} MB · Rotasi{" "}
                      {item.rotation}°
                    </span>
                  </div>
                  <div className="mergeButtons">
                    <button
                      onClick={() => setPreviewId(item.id)}
                      title="Preview PDF"
                    >
                      ◉
                    </button>
                    <button
                      onClick={() =>
                        setItems((old) =>
                          old.map((x) =>
                            x.id === item.id
                              ? { ...x, rotation: (x.rotation + 90) % 360 }
                              : x,
                          ),
                        )
                      }
                      title="Putar"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => move(item.id, index - 1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(item.id, index + 1)}
                      disabled={index === items.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        setItems((old) => old.filter((x) => x.id !== item.id))
                      }
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <label className="outputName">
              <span>Nama file hasil</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="confirm mergeConfirm">
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Urutan, rotasi, dan nama file sudah benar
              </label>
              <button
                className="button"
                onClick={merge}
                disabled={busy || items.length < 2}
              >
                {busy ? "Menggabungkan…" : "Gabungkan dan download →"}
              </button>
            </div>
          </section>
        )}
        {previewId && items.find((item) => item.id === previewId) && (
          <PdfPreviewModal
            data={items.find((item) => item.id === previewId)!.file}
            filename={items.find((item) => item.id === previewId)!.file.name}
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
