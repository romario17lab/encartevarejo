"use client";
// Pareamento na própria TV: dígitos grandes, teclado na tela navegável pelas setas do controle remoto
// (OK = Enter) e também pelo teclado físico.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getToken, setToken, setupOffline } from "./device";

const ALPHABET = "ACDEFHJKMNPQRTUVWXY3479";
const LEN = 6;
const KEYS = [...ALPHABET.split(""), "⌫"];
const COLS = 12;

export function TvPairScreen() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error" | "ok"; text?: string }>({ kind: "idle" });
  const keyRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const connectRef = useRef<HTMLButtonElement | null>(null);
  const busy = status.kind === "busy" || status.kind === "ok";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (getToken() && !params.has("trocar")) { window.location.replace("/tv/play"); return; }
    if (params.get("motivo") === "desconectada") setStatus({ kind: "error", text: "Esta tela foi desconectada na gestão. Digite um código novo." });
    setupOffline();
    keyRefs.current[0]?.focus();
  }, []);

  const submit = useCallback(async (value: string) => {
    if (value.length !== LEN) return;
    setStatus({ kind: "busy", text: "Conectando…" });
    try {
      const res = await fetch("/api/tv/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: value }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus({ kind: "error", text: data?.error?.message ?? "Não foi possível conectar. Tente de novo." });
        setCode("");
        keyRefs.current[0]?.focus();
        return;
      }
      setToken(data.token);
      setStatus({ kind: "ok", text: `Conectada: ${data.screen?.name ?? "tela"}` });
      window.location.replace("/tv/play");
    } catch {
      setStatus({ kind: "error", text: "Sem conexão com a internet. Verifique o Wi-Fi e tente de novo." });
    }
  }, []);

  const press = useCallback((k: string) => {
    if (busy) return;
    if (k === "⌫") { setCode((c) => c.slice(0, -1)); return; }
    if (!ALPHABET.includes(k)) return;
    setCode((c) => {
      if (c.length >= LEN) return c;
      const next = c + k;
      if (next.length === LEN) setTimeout(() => void submit(next), 150);
      return next;
    });
    if (status.kind === "error") setStatus({ kind: "idle" });
  }, [busy, submit, status.kind]);

  // teclado físico (letras/números, apagar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); press("⌫"); return; }
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) { e.preventDefault(); press(e.key.toUpperCase()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  // setas do controle remoto
  const onGridKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | "connect" | null = null;
    if (e.key === "ArrowRight") next = Math.min(KEYS.length - 1, i + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (e.key === "ArrowDown") next = i + COLS < KEYS.length ? i + COLS : "connect";
    else if (e.key === "ArrowUp") next = i - COLS >= 0 ? i - COLS : null;
    if (next === null) return;
    e.preventDefault();
    if (next === "connect") connectRef.current?.focus();
    else keyRefs.current[next]?.focus();
  };

  const key = (w: string) => ({ width: w, height: "clamp(52px, 8.5vh, 92px)" });

  return (
    <main style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3.2vh", padding: "4vh 4vw", fontFamily: "Inter, system-ui, sans-serif", background: "radial-gradient(circle at 50% 0%, #12372c 0%, #000 70%)", color: "#fff", textAlign: "center" }}>
      <style>{`.tvk{border:3px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:16px;font:700 clamp(24px,4.2vh,44px)/1 Inter,system-ui,sans-serif;cursor:pointer;outline:none;transition:transform .08s,background .08s}
        .tvk:focus-visible,.tvk:focus{border-color:#facc15;background:rgba(250,204,21,.22);transform:scale(1.08)}
        .tvk:disabled{opacity:.5}
        .tvgo{background:#16a34a;border-color:#16a34a}.tvgo:focus{background:#22c55e;border-color:#facc15}`}</style>
      <div>
        <h1 style={{ margin: 0, fontSize: "clamp(30px, 5.6vh, 64px)", fontWeight: 800 }}>Conectar esta TV</h1>
        <p style={{ margin: "1.2vh 0 0", fontSize: "clamp(18px, 2.8vh, 32px)", color: "rgba(255,255,255,.78)" }}>
          No celular ou computador, abra <b>TV da loja</b> na gestão, escolha a tela e digite aqui o código de 6 caracteres.
        </p>
      </div>
      <div aria-label="Código de pareamento" role="group" style={{ display: "flex", gap: "1.2vw" }}>
        {Array.from({ length: LEN }, (_, i) => (
          <div key={i} data-tv-digit={i} style={{
            width: "clamp(56px, 8vw, 140px)", height: "clamp(72px, 15vh, 170px)", borderRadius: 20,
            border: `4px solid ${i === code.length && !busy ? "#facc15" : "rgba(255,255,255,.25)"}`, background: "rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(44px, 10vh, 120px)", fontWeight: 800, letterSpacing: 0,
            fontFamily: "'Bebas Neue', Inter, system-ui, sans-serif",
          }}>{code[i] ?? ""}</div>
        ))}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, minHeight: "4vh", fontSize: "clamp(18px, 3vh, 34px)", fontWeight: 600, color: status.kind === "error" ? "#fca5a5" : status.kind === "ok" ? "#86efac" : "rgba(255,255,255,.85)" }}>
        {status.text ?? "Use as setas do controle e OK, ou digite no teclado."}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, auto)`, gap: "1vh 0.8vw", justifyContent: "center" }}>
        {KEYS.map((k, i) => (
          <button key={k} type="button" className="tvk" ref={(el) => { keyRefs.current[i] = el; }} disabled={busy}
            aria-label={k === "⌫" ? "Apagar" : k} onKeyDown={(e) => onGridKey(e, i)} onClick={() => press(k)} style={key("clamp(52px, 6.4vw, 104px)")}>
            {k}
          </button>
        ))}
      </div>
      <button ref={connectRef} type="button" className="tvk tvgo" disabled={busy} onClick={() => void submit(code)}
        onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); keyRefs.current[KEYS.length - 1]?.focus(); } }}
        style={{ ...key("clamp(240px, 26vw, 460px)") }}>
        Conectar
      </button>
    </main>
  );
}
