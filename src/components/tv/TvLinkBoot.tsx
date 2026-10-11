"use client";
import { useEffect, useState } from "react";
import { setToken } from "./device";

export function TvLinkBoot({ token }: { token: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!/^tvd_[A-Za-z0-9_-]{20,120}$/.test(token)) { setBad(true); return; }
    setToken(token);
    // tira o token do histórico do navegador e abre o player
    window.location.replace("/tv/play");
  }, [token]);
  return (
    <main style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif", fontSize: 40, textAlign: "center", padding: 48 }}>
      {bad ? <p>Link do player inválido. Gere um novo link na gestão da TV.</p> : <p>Abrindo o player…</p>}
    </main>
  );
}
