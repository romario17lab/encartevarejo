// Dev: mede larguras médias das fontes (usado para calibrar src/templates/parts/metrics.ts).
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { htmlDocument } from "./html";
const fonts: Array<[string, number]> = [["Inter", 400],["Inter",600],["Inter",800],["Inter",900],["Montserrat",700],["Montserrat",800],["Montserrat",900],["Oswald",500],["Oswald",700],["Anton",400],["Bebas Neue",400],["Playfair Display",700],["Playfair Display",900]];
const body = fonts.map(([f,w])=>`<span style="font-family:'${f}';font-weight:${w}">x</span>`).join("");
const p = "/tmp/claude-0/-home-claude/8efc9122-db86-566f-848f-8c193bb5ae0d/scratchpad/m.html";
writeFileSync(p, htmlDocument(body));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const pg = await b.newPage(); await pg.goto("file://"+p); await pg.evaluate(()=>document.fonts.ready);
const r = await pg.evaluate((fonts)=>{ const c=document.createElement("canvas").getContext("2d")!; const o:any={};
 for (const [f,w] of fonts){ c.font=`${w} 100px "${f}"`; const ok=document.fonts.check(`${w} 100px "${f}"`);
  const dig="0123456789".split("").map(d=>c.measureText(d).width/100); const s="Biscoito recheado sabor chocolate com avelã embalagem família";
  o[`${f}:${w}`]={ok,digit:Math.max(...dig).toFixed(3),avg:(c.measureText(s).width/100/s.length).toFixed(3),upAvg:(c.measureText(s.toUpperCase()).width/100/s.length).toFixed(3),R:(c.measureText("R$").width/100).toFixed(3),comma:(c.measureText(",").width/100).toFixed(3)}; }
 return o; }, fonts);
console.log(JSON.stringify(r,null,1)); await b.close();
