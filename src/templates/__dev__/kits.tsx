// Dev (v3): kits de datas comemorativas aplicados a um modelo — só o cabeçalho e os cantos mudam.
// Uso: npx tsx src/templates/__dev__/kits.tsx [--out=dir] [--base=feira-da-semana]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineTemplate3 } from "../parts3/define3";
import { SEASON_KITS, withKit } from "../parts3/deco";
import type { KitId3, Look3 } from "../parts3/look3";
import type { Colors } from "../parts/types";
import { feiraLook3 } from "../feira-da-semana/v3";
import { getTemplate } from "../registry";
import { demoCampaign } from "../demo-data";
import { launch, openHtml, pieceMarkup } from "./render";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const OUT = args.out ?? "/mnt/project-files/encartevarejo/amostras-v3";
const TITLES: Record<KitId3, string> = { natal: "Ofertas de Natal", pascoa: "Ofertas de Páscoa", maes: "Semana das Mães", blackfriday: "Black Friday", arraia: "Arraiá de Ofertas" };

(async () => {
  mkdirSync(OUT, { recursive: true });
  const base = getTemplate("feira-da-semana", 3)!;
  const b = await launch();
  for (const kit of Object.keys(SEASON_KITS) as KitId3[]) {
    const t = defineTemplate3({ ...base, id: `kit-${kit}`, look: (c: Colors): Look3 => withKit(feiraLook3(c), kit) });
    const camp = demoCampaign(6, { title: TITLES[kit] });
    camp.brand.colors = { ...base.palette };
    const html = ["encarte_a4", "story"].map((f) => `<div style="display:inline-block;vertical-align:top;margin:8px">${pieceMarkup(t, f as "encarte_a4", camp, {}, 0, 0)}</div>`).join("");
    const p = await openHtml(b, `<div id="w" style="background:#777;display:inline-block;white-space:nowrap">${html}</div>`, { width: 2000, height: 1300 });
    const file = join(OUT, `kit-${kit}.png`);
    await p.locator("#w").screenshot({ path: file });
    await p.close();
    console.log("ok", file);
  }
  await b.close();
})();
