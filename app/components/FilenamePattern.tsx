"use client";

import { useState } from "react";

export type FilenamePart = "certificate" | "owner";

const labels: Record<FilenamePart, string> = {
  certificate: "Nomor Sertifikat",
  owner: "Nama Pemilik",
};
const parts: FilenamePart[] = ["certificate", "owner"];

export default function FilenamePattern({
  order,
  separator,
  onChange,
}: {
  order: FilenamePart[];
  separator: string;
  onChange: (order: FilenamePart[], separator: string) => void;
}) {
  const [dragged, setDragged] = useState<FilenamePart | null>(null);
  function move(target: FilenamePart) {
    if (!dragged || dragged === target) return;
    onChange(
      order.map((part) =>
        part === dragged ? target : part === target ? dragged : part,
      ),
      separator,
    );
    setDragged(null);
  }
  function toggle(part: FilenamePart) {
    if (order.includes(part)) {
      if (order.length === 1) return;
      onChange(
        order.filter((item) => item !== part),
        separator,
      );
      return;
    }
    onChange([...order, part], separator);
  }
  return (
    <section className="filenamePattern">
      <div>
        <small>POLA NAMA FILE</small>
        <b>Atur urutan sebelum download</b>
        <span>Aktifkan yang diperlukan, lalu atur urutannya.</span>
      </div>
      <div className="patternControls">
        <div className="patternToggles">
          {parts.map((part) => {
            const active = order.includes(part);
            const lastActive = active && order.length === 1;
            return (
              <button
                key={part}
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => toggle(part)}
                title={
                  lastActive
                    ? "Minimal satu bagian nama harus aktif"
                    : active
                      ? "Nonaktifkan bagian ini"
                      : "Aktifkan bagian ini"
                }
              >
                <i>{active ? "✓" : "＋"}</i> {labels[part]}
              </button>
            );
          })}
        </div>
        <div className="patternBuilder">
          {order.map((part, index) => (
            <span key={part} className="patternPartWrap">
              <button
                className="patternPart"
                draggable
                onDragStart={() => setDragged(part)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => move(part)}
                title="Geser untuk mengubah urutan"
              >
                ⠿ {labels[part]}
              </button>
              {index < order.length - 1 && (
                <select
                  aria-label="Pemisah nama file"
                  value={separator}
                  onChange={(event) => onChange(order, event.target.value)}
                >
                  <option value="_">_</option>
                  <option value=" - ">-</option>
                  <option value=" ">Spasi</option>
                </select>
              )}
            </span>
          ))}
          {order.length > 1 && (
            <button
              className="swapPattern"
              onClick={() => onChange([...order].reverse(), separator)}
              title="Tukar urutan"
            >
              ⇄ Tukar
            </button>
          )}
        </div>
      </div>
      <div className="patternExample">
        Contoh:{" "}
        <b>
          {order
            .map((part) =>
              part === "certificate"
                ? "G595.0.P.3.427.3214.126"
                : "SILVIA DEWI",
            )
            .join(separator)}
          .pdf
        </b>
      </div>
    </section>
  );
}
