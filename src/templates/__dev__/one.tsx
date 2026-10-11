// Dev: renderiza uma peça (todas as páginas) em PNG. Uso: npx tsx src/templates/__dev__/one.tsx <slug> <formato> <n> <saida.png> [json-overrides] [json-opcoes-demo]
import { getTemplate } from "../registry";
import { demoCampaign } from "../demo-data";
import { launch, openHtml, pieceMarkup } from "./render";
import type { FormatId } from "@/domain/formats";
(async () => {
  const [slug, f, n, out, ov, opts] = process.argv.slice(2);
  const t = getTemplate(slug)!;
  const camp = demoCampaign(Number(n), opts ? JSON.parse(opts) : {});
  camp.brand.colors = { ...t.palette };
  const b = await launch();
  const p = await openHtml(b, pieceMarkup(t, f as FormatId, camp, ov ? JSON.parse(ov) : {}, "all", 30), { width: 1200, height: 900 });
  await p.locator("[data-ev-render]").screenshot({ path: out });
  await b.close();
})();
