// Dev: junta várias PNGs numa grade para revisão visual rápida.
// Uso: npx tsx src/templates/__dev__/montage.ts <saida.png> <colunas> <largura-celula> arquivo1.png arquivo2.png ...
import { launch, openHtml } from "./render";
(async () => {
  const [out, cols, cw, ...files] = process.argv.slice(2);
  const b = await launch();
  const html = `<div style="display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:10px;padding:10px;background:#888">${files.map((f) => `<div><img src="file://${f}" style="width:${cw}px;display:block"><div style="font:12px Inter;color:#fff">${f.split("/").pop()}</div></div>`).join("")}</div>`;
  const p = await openHtml(b, html, { width: Number(cols) * (Number(cw) + 10) + 20, height: 600 });
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
