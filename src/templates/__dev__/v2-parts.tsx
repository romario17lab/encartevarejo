// Dev (v2): prancha de revisão dos objetos temáticos e fundos. Uso: npx tsx src/templates/__dev__/v2-parts.tsx <saida.png>
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeObject } from "../parts2/objects";
import { GroundFill } from "../parts2/grounds";
import type { Ground, ObjectKind } from "../parts2/look";
import { launch, openHtml } from "./render";

const kinds: ObjectKind[] = ["cart", "crate", "grill", "bread", "bucket", "megaphone", "gift", "wine", "pallet", "spray", "bag", "pricetag"];
const grounds: Ground[] = [
  { kind: "rays", base: "#c8160f", light: "#ff4a2e", dark: "#5e0505" },
  { kind: "confetti", base: "#1442b8", light: "#3f7bff", dark: "#071a55", accents: ["#ffd400", "#ff8a00", "#ffffff", "#2ee6a6"] },
  { kind: "wood", base: "#8a5326", light: "#b5763b", dark: "#4a2a10" },
  { kind: "carbon", base: "#2a0d10", light: "#5a1a20", dark: "#050202" },
  { kind: "paper", base: "#6b1018", light: "#9a1f2a", dark: "#2a0508" },
  { kind: "ice", base: "#0a8fc4", light: "#4fd6ff", dark: "#033e66", accents: ["#bdf3ff"] },
  { kind: "wheat", base: "#b8742f", light: "#d99a52", dark: "#6e3f14", accents: ["#ffe2a0"] },
  { kind: "flames", base: "#220606", light: "#4a0d0d", dark: "#050101", accents: ["#ffd23f", "#ff7a00", "#c81e00"] },
  { kind: "snow", base: "#b3121b", light: "#e5323a", dark: "#5a0509" },
  { kind: "kraft", base: "#b98a52", light: "#d6aa72", dark: "#7a5428" },
  { kind: "gold", base: "#15120c", light: "#2e2618", dark: "#000000", accents: ["#e6b84a"] },
  { kind: "halftone", base: "#1442b8", light: "#3f7bff", dark: "#071a55" },
  { kind: "bubbles", base: "#5b2ea6", light: "#8b5ce0", dark: "#250d52" },
  { kind: "leaves", base: "#1f7a2a", light: "#3fae3a", dark: "#0b3d14" },
  { kind: "stripes", base: "#e8392b", light: "#ff6a55", dark: "#8a120a" },
  { kind: "hazard", base: "#141414", light: "#3a3a3a", dark: "#000000", accents: ["#ffd400"] },
];
(async () => {
  const out = process.argv[2];
  const html = renderToStaticMarkup(
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 10, width: 1560, background: "#777" }}>
      {kinds.map((k) => (
        <div key={k} style={{ position: "relative", width: 250, height: 250, background: "#c8160f" }}>
          <ThemeObject kind={k} x={25} y={25} w={200} h={200} />
          <span style={{ position: "absolute", left: 4, top: 2, color: "#fff", font: "12px Inter" }}>{k}</span>
        </div>
      ))}
      {grounds.map((g) => (
        <div key={g.kind} style={{ position: "relative", width: 370, height: 250, overflow: "hidden" }}>
          <GroundFill g={g} w={370} h={250} />
          <span style={{ position: "absolute", left: 4, top: 2, color: "#fff", font: "12px Inter" }}>{g.kind}</span>
        </div>
      ))}
    </div>,
  );
  const b = await launch();
  const p = await openHtml(b, html, { width: 1600, height: 1200 });
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
