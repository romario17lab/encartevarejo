import sharp, { type OverlayOptions } from "sharp";
/** Folha de contato: imagens redimensionadas para a mesma altura, em linhas de `perRow`. */
export async function montage(images: Array<{ buf: Buffer; label: string }>, out: string, opts: { h?: number; perRow?: number } = {}) {
  const H = opts.h ?? 420, per = opts.perRow ?? 5, pad = 16, lab = 28;
  const tiles = await Promise.all(images.map(async (im) => {
    const r = await sharp(im.buf).resize({ height: H }).png().toBuffer({ resolveWithObject: true });
    return { buf: r.data, w: r.info.width, label: im.label };
  }));
  const rows: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += per) rows.push(tiles.slice(i, i + per));
  const W = Math.max(...rows.map((r) => r.reduce((s, t) => s + t.w + pad, pad)));
  const TH = rows.length * (H + lab + pad) + pad;
  const comps: OverlayOptions[] = [];
  rows.forEach((row, ri) => {
    let x = pad;
    const y = pad + ri * (H + lab + pad);
    for (const t of row) {
      const esc = t.label.replace(/[<&>]/g, "");
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${t.w}" height="${lab}"><text x="0" y="20" font-family="sans-serif" font-size="18" fill="#111">${esc}</text></svg>`), left: x, top: y });
      comps.push({ input: t.buf, left: x, top: y + lab });
      x += t.w + pad;
    }
  });
  await sharp({ create: { width: W, height: TH, channels: 3, background: "#d9d9d9" } }).composite(comps).png().toFile(out);
}
