// Dev (v2): renderiza um modelo (versão escolhida) em vários formatos lado a lado para revisão.
// Uso: npx tsx src/templates/__dev__/v2-shot.tsx <slug> <saida.png> [versão=2] [formatos=encarte_a4:12,story:4] [json-opcoes-demo]
import { getTemplate } from "../registry";
import { demoCampaign } from "../demo-data";
import { launch, openHtml, pieceMarkup } from "./render";
import type { FormatId } from "@/domain/formats";
(async () => {
  const [slug, out, ver = "2", fmts = "encarte_a4:12,story:4,post_quadrado:4,cartaz_a4:1", opts] = process.argv.slice(2);
  const t = getTemplate(slug, Number(ver))!;
  const b = await launch();
  const parts: string[] = [];
  for (const spec of fmts.split(",")) {
    const [f, n, page = "0"] = spec.split(":");
    const camp = demoCampaign(Number(n), opts ? JSON.parse(opts) : {});
    camp.brand.colors = { ...t.palette };
    parts.push(`<div style="display:inline-block;vertical-align:top;margin:8px">${pieceMarkup(t, f as FormatId, camp, {}, page === "all" ? "all" : Number(page), 16)}</div>`);
  }
  const p = await openHtml(b, `<div id="w" style="background:#777;display:inline-block;white-space:nowrap">${parts.join("")}</div>`, { width: 1400, height: 900 });
  await p.locator("#w").screenshot({ path: out });
  await b.close();
})();
