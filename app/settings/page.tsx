"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export default function Settings() {
  const [duration, setDuration] = useState("8h"),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("nadia-session-duration");
    if (saved) setDuration(saved);
  }, []);
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/session-duration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ duration }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan.");
      localStorage.setItem("nadia-session-duration", duration);
      setMessage(
        "Pengaturan berhasil disimpan. Waktu sesi dihitung ulang mulai sekarang.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="toolPage">
      <header className="toolHeader">
        <Link href="/dashboard" className="backButton">
          ←
        </Link>
        <div>
          <small>AKUN</small>
          <h1>Pengaturan</h1>
          <p>Atur preferensi sesi dan tampilan akun Anda.</p>
        </div>
      </header>
      <main className="settingsContent">
        <section>
          <small>KEAMANAN SESI</small>
          <h2>Keluar otomatis</h2>
          <p>
            Pilih berapa lama akun boleh tetap masuk. Durasi diperbarui setiap
            kali pengaturan disimpan.
          </p>
          <div className="durationCards">
            {[
              ["1h", "1 jam", "Untuk perangkat bersama"],
              ["8h", "8 jam", "Satu hari kerja"],
              ["1d", "1 hari", "Perangkat pribadi"],
              ["7d", "7 hari", "Jarang perlu login ulang"],
            ].map(([value, title, desc]) => (
              <button
                key={value}
                className={duration === value ? "active" : ""}
                onClick={() => setDuration(value)}
              >
                <b>{title}</b>
                <span>{desc}</span>
                <i>✓</i>
              </button>
            ))}
          </div>
          <button
            className="button saveSettings"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
          {message && <div className="settingsMessage">{message}</div>}
        </section>
        <aside>
          <b>Catatan keamanan</b>
          <p>
            Gunakan durasi singkat jika perangkat digunakan bersama. Developer
            dapat mengganti password jika akses perlu dihentikan.
          </p>
        </aside>
      </main>
    </div>
  );
}
