"use client";
import { useEffect, useRef, useState } from "react";
type Manual = {
  certificate: string;
  owner: string;
  nidi: string;
  output: string;
};
export default function PdfPreviewModal({
  data,
  filename,
  onClose,
  manual,
  onManualChange,
  onPrevious,
  onNext,
  position,
  warning,
}: {
  data: BlobPart;
  filename: string;
  onClose: () => void;
  manual?: Manual;
  onManualChange?: (field: keyof Manual, value: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
  warning?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    pane = useRef<HTMLElement>(null),
    doc = useRef<any>(null),
    drag = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(1);
    setZoom(1);
    setRotation(0);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const blob =
            data instanceof Blob
              ? data
              : new Blob([data], { type: "application/pdf" }),
          loaded = await pdfjs.getDocument({ data: await blob.arrayBuffer() })
            .promise;
        if (!active) {
          loaded.cleanup();
          return;
        }
        doc.current = loaded;
        setPages(loaded.numPages);
        setLoading(false);
      } catch {
        if (active) {
          setError("Preview PDF tidak dapat ditampilkan.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      doc.current?.cleanup();
      doc.current = null;
    };
  }, [data]);
  useEffect(() => {
    let cancelled = false,
      task: any;
    (async () => {
      if (!doc.current || !canvas.current) return;
      const pdfPage = await doc.current.getPage(page),
        viewport = pdfPage.getViewport({
          scale: zoom * 1.25,
          rotation: (pdfPage.rotate + rotation) % 360,
        }),
        ctx = canvas.current.getContext("2d");
      if (!ctx) return;
      canvas.current.width = Math.floor(viewport.width);
      canvas.current.height = Math.floor(viewport.height);
      task = pdfPage.render({ canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        if (!cancelled) setError("Halaman gagal dirender.");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [page, zoom, rotation, loading]);
  function wheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) =>
      Math.min(
        3,
        Math.max(0.5, Number((z + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(1))),
      ),
    );
  }
  function startDrag(e: React.MouseEvent<HTMLElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".canvasTools"))
      return;
    const el = pane.current;
    if (!el) return;
    drag.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    setDragging(true);
    e.preventDefault();
  }
  function moveDrag(e: React.MouseEvent<HTMLElement>) {
    const el = pane.current,
      d = drag.current;
    if (!el || !d.active) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  }
  function endDrag() {
    drag.current.active = false;
    setDragging(false);
  }
  return (
    <div
      className="pdfPreviewOverlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={"pdfPreviewModal " + (manual ? "withManual" : "")}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <small>PREVIEW PDF {position && `· ${position}`}</small>
            <b>{filename}</b>
          </div>
          <div className="previewNav">
            {onPrevious && (
              <button onClick={onPrevious} title="File sebelumnya">
                ←
              </button>
            )}
            {onNext && (
              <button onClick={onNext} title="File selanjutnya">
                →
              </button>
            )}
            <button onClick={onClose} aria-label="Tutup preview">
              ×
            </button>
          </div>
        </header>
        <div className="previewBody">
          <section
            ref={pane}
            className={`canvasPane ${dragging ? "dragging" : ""}`}
            onWheel={wheel}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            <div className="canvasTools">
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
                ＋
              </button>
              <button onClick={() => setRotation((r) => (r + 270) % 360)}>
                ↶
              </button>
              <button onClick={() => setRotation((r) => (r + 90) % 360)}>
                ↷
              </button>
              {pages > 1 && (
                <>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    {page}/{pages}
                  </span>
                  <button
                    disabled={page === pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {loading && <div className="previewLoading">Memuat preview…</div>}
            {error && <div className="previewLoading">{error}</div>}
            <canvas ref={canvas} />
          </section>
          {manual && onManualChange && (
            <aside className="manualPane">
              <small>KOREKSI MANUAL</small>
              <h2>Periksa dan sesuaikan data</h2>
              <p>
                Gunakan scroll mouse di dokumen untuk zoom. Perubahan nama hasil
                tersimpan langsung.
              </p>
              {warning && <div className="manualWarning">⚠ {warning}</div>}
              <label>
                Nomor sertifikat
                <input
                  value={manual.certificate}
                  onChange={(e) =>
                    onManualChange("certificate", e.target.value)
                  }
                  placeholder="D605.0.P.3.427.3217.G26"
                />
              </label>
              <label>
                Nama pemilik
                <input
                  value={manual.owner}
                  onChange={(e) =>
                    onManualChange("owner", e.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                Nama file hasil
                <input
                  className="manualOutput"
                  value={manual.output}
                  onChange={(e) => onManualChange("output", e.target.value)}
                />
              </label>
              <div className="manualHint">
                Titik Nomor Sertifikat ditambahkan otomatis. Data dapat diisi
                walaupun AI gagal atau kuota habis.
              </div>
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}
