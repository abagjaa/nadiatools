"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export default function Settings() {
  const [duration, setDuration] = useState("8h"),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [keys, setKeys] = useState({ gemini: "", openai: "" }),
    [keyStatus, setKeyStatus] = useState({
      gemini: { configured: false, masked: "" },
      openai: { configured: false, masked: "" },
    }),
    [keyMessage, setKeyMessage] = useState(""),
    [keySaving, setKeySaving] = useState<"gemini" | "openai" | "">("");
  useEffect(() => {
    const saved = localStorage.getItem("nadia-session-duration");
    if (saved) setDuration(saved);
    fetch("/api/settings/api-keys")
      .then(
        (response) =>
          response.json() as Promise<{
            gemini?: { configured: boolean; masked: string };
            openai?: { configured: boolean; masked: string };
          }>,
      )
      .then((data) => {
        if (data.gemini && data.openai)
          setKeyStatus({ gemini: data.gemini, openai: data.openai });
      })
      .catch(() => undefined);
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
  async function saveKey(provider: "gemini" | "openai") {
    const key = keys[provider].trim();
    if (!key) return setKeyMessage("Masukkan API key terlebih dahulu.");
    setKeySaving(provider);
    setKeyMessage("");
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = (await response.json()) as {
        error?: string;
        configured?: boolean;
        masked?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "API key gagal disimpan.");
      setKeyStatus((current) => ({
        ...current,
        [provider]: { configured: true, masked: data.masked || "Tersimpan" },
      }));
      setKeys((current) => ({ ...current, [provider]: "" }));
      setKeyMessage(
        `${provider === "gemini" ? "Gemini" : "OpenAI"} API key pribadi berhasil disimpan.`,
      );
    } catch (reason) {
      setKeyMessage(
        reason instanceof Error ? reason.message : "API key gagal disimpan.",
      );
    } finally {
      setKeySaving("");
    }
  }
  async function removeKey(provider: "gemini" | "openai") {
    setKeySaving(provider);
    setKeyMessage("");
    try {
      const response = await fetch(
        `/api/settings/api-keys?provider=${provider}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "API key gagal dihapus.");
      setKeyStatus((current) => ({
        ...current,
        [provider]: { configured: false, masked: "" },
      }));
      setKeyMessage("API key berhasil dihapus dari perangkat ini.");
    } catch (reason) {
      setKeyMessage(
        reason instanceof Error ? reason.message : "API key gagal dihapus.",
      );
    } finally {
      setKeySaving("");
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
          <div className="apiKeyDivider" />
          <small>API KEY PRIBADI</small>
          <h2>Gemini dan OpenAI</h2>
          <p>
            Key hanya berlaku untuk akun ini pada browser ini. Key dienkripsi
            dan tidak ditampilkan kembali setelah disimpan.
          </p>
          <div className="apiKeyCards">
            {(["gemini", "openai"] as const).map((provider) => (
              <article key={provider}>
                <div className="apiKeyHead">
                  <div>
                    <b>{provider === "gemini" ? "Gemini" : "OpenAI"}</b>
                    <span>
                      {keyStatus[provider].configured
                        ? `Aktif · ${keyStatus[provider].masked}`
                        : "Belum diatur"}
                    </span>
                  </div>
                  <i className={keyStatus[provider].configured ? "active" : ""}>
                    {keyStatus[provider].configured ? "AKTIF" : "KOSONG"}
                  </i>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={keys[provider]}
                  onChange={(event) =>
                    setKeys((current) => ({
                      ...current,
                      [provider]: event.target.value,
                    }))
                  }
                  placeholder={
                    keyStatus[provider].configured
                      ? "Masukkan key baru untuk mengganti"
                      : "Tempel API key di sini"
                  }
                />
                <div>
                  {keyStatus[provider].configured && (
                    <button
                      className="removeApiKey"
                      onClick={() => removeKey(provider)}
                      disabled={Boolean(keySaving)}
                    >
                      Hapus
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => saveKey(provider)}
                    disabled={Boolean(keySaving)}
                  >
                    {keySaving === provider ? "Menyimpan…" : "Simpan key"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {keyMessage && <div className="settingsMessage">{keyMessage}</div>}
        </section>
        <aside>
          <b>Catatan keamanan</b>
          <p>
            Gunakan durasi singkat jika perangkat digunakan bersama. Developer
            dapat mengganti password jika akses perlu dihentikan.
          </p>
          <p>
            API key bersifat pribadi per akun dan browser. Nadia, Agus, dan
            Anggota Tim tidak saling memakai key satu sama lain.
          </p>
        </aside>
      </main>
    </div>
  );
}
