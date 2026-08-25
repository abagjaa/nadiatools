"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandLogo from "../components/BrandLogo";

const cards = [
  {
    slug: "split-pdf",
    href: "/tools/split-pdf",
    icon: "↗",
    title: "Pisahkan PDF",
    desc: "Pisahkan per halaman atau rentang visual.",
  },
  {
    slug: "rename-pdf",
    href: "/tools/rename-pdf",
    icon: "Aa",
    title: "Rename PDF",
    desc: "Baca sertifikat dan rapikan nama file.",
  },
  {
    slug: "merge-pdf",
    href: "/tools/merge-pdf",
    icon: "⊕",
    title: "Gabungkan PDF",
    desc: "Atur dan satukan beberapa dokumen.",
  },
  {
    slug: "slo-nidi-extractor",
    href: "/tools/slo-nidi-extractor",
    icon: "⌁",
    title: "SLO & NIDI Extractor",
    desc: "Sinkronkan sertifikat dengan Excel.",
  },
];

type User = { name: string; role: string; access: string[] };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null),
    [dark, setDark] = useState(false),
    [history, setHistory] = useState<any[]>([]),
    [feedback, setFeedback] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data as User));
    try {
      setHistory(JSON.parse(localStorage.getItem("nadia-history") || "[]"));
      setFeedback(JSON.parse(localStorage.getItem("nadia-feedback") || "[]"));
    } catch {}
  }, []);
  const all = user?.access?.includes("*");
  const visible = cards.filter((c) => all || user?.access?.includes(c.slug));
  const role =
    user?.role === "developer"
      ? "Developer"
      : user?.role === "primary"
        ? "Pengguna Utama"
        : "Anggota Tim";
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }
  return (
    <div className="workspace">
      <aside className="side">
        <Link className="brand brand-image" href="/">
          <BrandLogo />
        </Link>
        <nav>
          <a className="active">
            ⌂ <span>Beranda</span>
          </a>
          <a>
            ◫ <span>Riwayat</span>
          </a>
          <Link href="/feedback">
            ♢ <span>Feedback</span>
          </Link>
          <Link href="/settings">
            ⚙ <span>Pengaturan</span>
          </Link>
          {user?.role === "developer" && (
            <Link href="/developer">
              ▥ <span>Developer</span>
            </Link>
          )}
        </nav>
        <div className="sideFoot">
          <button className="logoutSide" onClick={logout}>
            ↪ <span>Keluar</span>
          </button>
          <div className="profile">
            <span>
              {user?.name
                ?.split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2) || "…"}
            </span>
            <div>
              <b>{user?.name || "Memuat…"}</b>
              <small>{role}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="dash">
        <header>
          <div>
            <small>SELAMAT DATANG</small>
            <h1>Workspace {user?.name?.split(" ")[0] || "Anda"}</h1>
          </div>
          <div className="dashActions">
            <button
              className="theme"
              onClick={() => {
                const n = !dark;
                setDark(n);
                document.documentElement.dataset.theme = n ? "dark" : "light";
              }}
            >
              ◐
            </button>
            <button className="bell">
              ♢<i>{feedback.filter((x) => x.status === "Baru").length}</i>
            </button>
          </div>
        </header>
        <section className="welcome">
          <div>
            <span>
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <h2>
              Apa yang ingin
              <br />
              diselesaikan hari ini?
            </h2>
            <p>Mulai proses baru atau lanjutkan pekerjaan terakhir Anda.</p>
          </div>
          <div className="miniStats">
            <article>
              <b>{history.length}</b>
              <span>Total proses</span>
            </article>
            <article>
              <b>{visible.length}</b>
              <span>Tools tersedia</span>
            </article>
          </div>
        </section>
        <div className="dashTitle">
          <div>
            <h2>Tools</h2>
            <p>Pilih tool untuk memulai pekerjaan baru.</p>
          </div>
        </div>
        <section className="toolGrid">
          {visible.map((t, i) => (
            <Link href={t.href} className="dashTool" key={t.title}>
              <div className="toolIcon">{t.icon}</div>
              <span className="toolIndex">0{i + 1}</span>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
              <div className="toolOpen">Buka tool →</div>
            </Link>
          ))}
        </section>
        {visible.length === 0 && (
          <div className="emptyAccess">
            Belum ada tool yang diberikan untuk akun ini. Hubungi Developer.
          </div>
        )}
      </main>
    </div>
  );
}
