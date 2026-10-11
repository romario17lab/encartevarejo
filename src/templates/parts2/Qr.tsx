// QR code síncrono (SVG), seguro no servidor e no cliente: usa só o codificador puro do pacote "qrcode".
import type { ReactElement } from "react";
import { create } from "qrcode";
import { fontStack, fitWidth, r1 } from "./measure";

const cache = new Map<string, { size: number; path: string } | null>();

function qrPath(text: string): { size: number; path: string } | null {
  if (cache.has(text)) return cache.get(text)!;
  let out: { size: number; path: string } | null = null;
  try {
    const qr = create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const d = qr.modules.data;
    let path = "";
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (d[y * n + x]) {
          let e = x;
          while (e < n && d[y * n + e]) e++;
          path += `M${x} ${y}h${e - x}v1h${x - e}z`;
          x = e;
        } else x++;
      }
    }
    out = { size: n, path };
  } catch {
    out = null;
  }
  cache.set(text, out);
  return out;
}

/** Bloco "aponte a câmera" com o QR da vitrine (link da loja). Não renderiza nada se não der para codificar. */
export function QrBlock({ url, x, y, size, caption = "Veja todas as ofertas", fg = "#111111" }: { url: string; x: number; y: number; size: number; caption?: string; fg?: string }): ReactElement | null {
  const q = qrPath(url);
  if (!q) return null;
  const pad = size * 0.07;
  const capH = size * 0.17;
  const qs = size - pad * 2 - capH;
  const fs = fitWidth(caption, { family: "Inter", weight: 800 }, size - pad * 2, capH * 0.62, 5);
  return (
    <div data-ev-qr="" style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(size), height: r1(size), background: "#ffffff", borderRadius: r1(size * 0.08), boxShadow: "0 3px 8px rgba(0,0,0,.3)" }}>
      <svg role="img" aria-label={`QR code: ${url}`} width={r1(qs)} height={r1(qs)} viewBox={`-2 -2 ${q.size + 4} ${q.size + 4}`} shapeRendering="crispEdges" style={{ position: "absolute", left: r1((size - qs) / 2), top: r1(pad) }}>
        <path d={q.path} fill={fg} />
      </svg>
      <div style={{ position: "absolute", left: 0, top: r1(size - capH - pad * 0.4), width: r1(size), height: r1(capH), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack("Inter"), fontWeight: 800, fontSize: fs, color: fg, whiteSpace: "nowrap" }}>{caption}</div>
    </div>
  );
}
