"use client";
import { useEffect, useState } from "react";
import BrandLogo from "./components/BrandLogo";

const tools = [
  [
    "01",
    "Pisahkan PDF",
    "Pisahkan per halaman atau rentang visual, lalu tinjau sebelum mengunduh.",
  ],
  [
    "02",
    "Rename PDF",
    "Baca sertifikat digital maupun scan dan susun pola nama dengan mudah.",
  ],
  [
    "03",
    "Gabungkan PDF",
    "Atur urutan, putar, dan hapus halaman sebelum menghasilkan satu PDF.",
  ],
  [
    "04",
    "SLO & NIDI Extractor",
    "Sinkronkan nama, nomor SLO, dan NIDI ke Excel dengan review lengkap.",
  ],
];
const steps = [
  [
    "Unggah",
    "Pilih PDF, folder, ZIP, Excel, atau ambil foto langsung dari HP.",
  ],
  [
    "Proses",
    "Teks digital dibaca langsung. Dokumen scan diteruskan ke OpenAI.",
  ],
  ["Periksa", "Koreksi data, nama file, pasangan dokumen, dan urutan halaman."],
  [
    "Unduh",
    "Konfirmasi hasil lalu unduh sebagai PDF, ZIP, folder, atau Excel.",
  ],
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("nadia-theme");
    const value = saved
      ? saved === "dark"
      : matchMedia("(prefers-color-scheme:dark)").matches;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);
  const toggle = () => {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("nadia-theme", value ? "dark" : "light");
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.trim()) return setMessage("Masukkan password untuk melanjutkan.");
    setLoading(true);
    setMessage("");
    try {
      const duration = localStorage.getItem("nadia-session-duration") || "8h";
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass, duration }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Login gagal.");
      window.location.href = "/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main>
      <nav className="nav shell">
        <a className="brand brand-image" href="#top">
          <BrandLogo />
        </a>
        <div className="actions">
          <button className="theme" onClick={toggle} aria-label="Ganti tema">
            {dark ? "☀" : "◐"}
          </button>
          <button className="button small" onClick={() => setOpen(true)}>
            Masuk
          </button>
        </div>
      </nav>
      <section className="hero shell" id="top">
        <div>
          <div className="eyebrow">
            <i /> Ruang kerja dokumen internal
          </div>
          <h1>
            Lebih sedikit pekerjaan manual. <em>Lebih banyak yang selesai.</em>
          </h1>
          <p className="lead">
            Nadia’s Tools membantu tim mengolah PDF dan Excel lebih cepat,
            dengan alur yang jelas dan hasil yang selalu bisa diperiksa.
          </p>
          <div className="heroButtons">
            <button className="button" onClick={() => setOpen(true)}>
              Masuk ke workspace <span>→</span>
            </button>
            <a href="#cara">Lihat cara kerja</a>
          </div>
          <div className="trust">
            <span>✓ File dihapus otomatis</span>
            <span>✓ Review sebelum unduh</span>
            <span>✓ Siap untuk HP</span>
          </div>
        </div>
        <div className="visual">
          <div className="glow" />
          <div className="paper back" />
          <div className="paper front">
            <div className="paperTop">
              <span className="pdf">PDF</span>
              <span className="ready">Siap diperiksa</span>
            </div>
            <div className="titleLine" />
            <div className="line wide" />
            <div className="line" />
            <div className="result">
              <small>HASIL PEMBACAAN</small>
              <p>
                <span>Nama pemilik</span>
                <b>Lanny Tania</b>
              </p>
              <p>
                <span>Nomor SLO</span>
                <b>F256.0...H26</b>
              </p>
              <p>
                <span>NIDI</span>
                <b>I.08.2026...</b>
              </p>
            </div>
          </div>
          <div className="chip one">✓ Teks terbaca</div>
          <div className="chip two">
            <b>AI</b> Scan diproses
          </div>
        </div>
      </section>
      <section className="toolBand">
        <div className="tools shell">
          {tools.map((t) => (
            <article key={t[0]}>
              <span>{t[0]}</span>
              <h2>{t[1]}</h2>
              <p>{t[2]}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="how shell" id="cara">
        <div className="sectionHead">
          <div>
            <div className="eyebrow">
              <i /> Cara kerja
            </div>
            <h2>
              Satu alur yang konsisten,
              <br />
              untuk semua tools.
            </h2>
          </div>
          <p>
            Tak perlu menebak langkah selanjutnya. Setiap proses dirancang agar
            mudah diikuti dan aman dikoreksi.
          </p>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <article key={s[0]}>
              <span>{i + 1}</span>
              <h3>{s[0]}</h3>
              <p>{s[1]}</p>
              {i < 3 && <i>→</i>}
            </article>
          ))}
        </div>
      </section>
      <footer className="footer shell">
        <div className="brand brand-image">
          <BrandLogo />
        </div>
        <p>Workspace dokumen untuk Nadia dan tim.</p>
      </footer>
      {open && (
        <div
          className="overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <section className="login" role="dialog" aria-modal="true">
            <button className="close" onClick={() => setOpen(false)}>
              ×
            </button>
            <span className="mark">N</span>
            <small>WORKSPACE INTERNAL</small>
            <h2>Selamat datang kembali</h2>
            <p>
              Masukkan password pribadi. Sistem akan mengenali peran Anda secara
              otomatis.
            </p>
            <form onSubmit={login}>
              <label htmlFor="pass">Password</label>
              <input
                id="pass"
                type="password"
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setMessage("");
                }}
                placeholder="Masukkan password"
                autoFocus
              />
              {message && <div className="message">{message}</div>}
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Memeriksa…" : "Masuk ke workspace →"}
              </button>
            </form>
            <p className="hint">
              Lupa password? Hubungi Developer untuk membuat password baru.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
