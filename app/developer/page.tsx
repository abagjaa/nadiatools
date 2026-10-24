"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export default function Developer() {
  const [history, setHistory] = useState<any[]>([]),
    [tickets, setTickets] = useState<any[]>([]);
  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem("nadia-history") || "[]"));
      setTickets(JSON.parse(localStorage.getItem("nadia-feedback") || "[]"));
    } catch {}
  }, []);
  function status(id: string, value: string) {
    const next = tickets.map((x) =>
      x.id === id ? { ...x, status: value } : x,
    );
    setTickets(next);
    localStorage.setItem("nadia-feedback", JSON.stringify(next));
  }
  const success = history.filter((x) => x.status === "Berhasil").length;
  return (
    <div className="toolPage">
      <header className="toolHeader">
        <Link href="/dashboard" className="backButton">
          ←
        </Link>
        <div>
          <small>KHUSUS DEVELOPER</small>
          <h1>Laporan & Pengelolaan</h1>
          <p>Statistik penggunaan dan laporan pengguna.</p>
        </div>
      </header>
      <main className="developerContent">
        <section className="devStats">
          <article>
            <span>Total proses</span>
            <b>{history.length}</b>
          </article>
          <article>
            <span>Berhasil</span>
            <b>{success}</b>
          </article>
          <article>
            <span>File diproses</span>
            <b>{history.reduce((a, x) => a + (x.count || 0), 0)}</b>
          </article>
          <article>
            <span>Laporan baru</span>
            <b>{tickets.filter((x) => x.status === "Baru").length}</b>
          </article>
        </section>
        <section className="devGrid">
          <div className="devPanel">
            <small>AKTIVITAS</small>
            <h2>Riwayat penggunaan</h2>
            {history.length ? (
              <div className="activityList">
                {history.map((x) => (
                  <article key={x.id}>
                    <div>
                      <b>{x.tool}</b>
                      <span>
                        {new Date(x.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <i>{x.count} file</i>
                    <em>{x.status}</em>
                  </article>
                ))}
              </div>
            ) : (
              <p className="emptyState">Belum ada aktivitas yang tercatat.</p>
            )}
          </div>
          <div className="devPanel">
            <small>LAPORAN PENGGUNA</small>
            <h2>Feedback & bug</h2>
            {tickets.length ? (
              <div className="devTickets">
                {tickets.map((t) => (
                  <article key={t.id}>
                    <div>
                      <b>{t.type}</b>
                      <span>
                        {t.urgency} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString("id-ID")}
                      </span>
                    </div>
                    <p>{t.description}</p>
                    {t.screenshot && (
                      <img src={t.screenshot} alt="Screenshot laporan" />
                    )}
                    <select
                      value={t.status}
                      onChange={(e) => status(t.id, e.target.value)}
                    >
                      <option>Baru</option>
                      <option>Sedang diperiksa</option>
                      <option>Selesai</option>
                    </select>
                  </article>
                ))}
              </div>
            ) : (
              <p className="emptyState">Belum ada laporan.</p>
            )}
          </div>
        </section>
        <section className="geminiPanel">
          <div>
            <small>AI API</small>
            <h2>API key per pengguna</h2>
            <p>
              Setiap pengguna mengatur Gemini dan OpenAI API key pribadinya
              melalui menu Pengaturan.
            </p>
          </div>
          <span className="statusWaiting">PER AKUN</span>
        </section>
      </main>
    </div>
  );
}
