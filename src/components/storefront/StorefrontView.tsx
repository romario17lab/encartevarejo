"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { formatBRL, priceParts } from "@/domain/money";
import { UNITS, type Offer, type Unit } from "@/domain/offer";
import { toast } from "@/components/ui";

// Vitrine pública (cliente final). Recebe só dados públicos já filtrados pelo servidor (sem custo).
// Lista de interesse: monta uma mensagem de WhatsApp para a loja. Não é compra nem pagamento.

export interface StorefrontViewItem {
  id: string; name: string; brand: string | null; sizeLabel: string | null; unit: Unit | null; category: string | null;
  imageUrl: string | null; offer: Offer; offerText: string; highlight: boolean;
}
export interface StorefrontViewData {
  slug: string; source: string | null; pageUrl: string; isDemo: boolean;
  store: {
    name: string; logoUrl: string | null; slogan: string | null; address: string | null; hours: string | null;
    phone: string | null; phoneDigits: string | null; whatsapp: string | null; whatsappNumber: string | null; legalText: string | null;
  };
  colors: { primary: string; onPrimary: string; price: string };
  campaigns: Array<{ id: string; title: string; subtitle: string | null; validity: string; items: StorefrontViewItem[] }>;
}

const OTHER = "Outras ofertas";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const unitShort = (u: Unit | null) => (u ? UNITS[u].short : "");

function sendEvent(slug: string, kind: "whatsapp_click" | "share", source: string | null, campaignId?: string | null) {
  try {
    void fetch(`/api/storefront/${encodeURIComponent(slug)}/event`, {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ kind, source, campaignId: campaignId ?? null }),
    }).catch(() => {});
  } catch { /* contagem é opcional */ }
}

function Price({ offer, unit, color }: { offer: Offer; unit: Unit | null; color: string }) {
  const u = unitShort(unit);
  const main = offer.mode === "combo" ? offer.comboCents : offer.priceCents;
  if (main == null) return null;
  const p = priceParts(main);
  return (
    <div aria-hidden="true" className="leading-none">
      {offer.mode === "from_to" && offer.regularCents != null && (
        <p className="mb-1 text-xs text-ink-muted">De <s>{formatBRL(offer.regularCents)}</s> por</p>
      )}
      {offer.mode === "min_qty" && offer.minQty != null && <p className="mb-1 text-xs font-semibold text-ink">A partir de {offer.minQty} {u || "un"}</p>}
      {offer.mode === "combo" && offer.comboQty != null && <p className="mb-1 text-xs font-semibold text-ink">Leve {offer.comboQty} por</p>}
      <p className="flex items-start font-display font-extrabold" style={{ color }}>
        <span className="mr-0.5 mt-1 text-xs">R$</span>
        <span className="text-3xl tracking-tight">{p.integer}</span>
        <span className="mt-0.5 text-base">,{p.decimal}</span>
        {offer.mode !== "combo" && u && <span className="ml-0.5 mt-auto text-xs font-semibold text-ink-muted">/{u}</span>}
      </p>
      {offer.mode === "min_qty" && <p className="mt-1 text-xs text-ink-muted">cada{offer.regularCents != null ? ` · Normal ${formatBRL(offer.regularCents)}` : ""}</p>}
      {offer.mode === "club" && offer.clubCents != null && (
        <p className="mt-1.5 inline-block rounded-md bg-ink px-1.5 py-1 text-xs font-bold text-white">
          {offer.clubName || "Clube"}: {formatBRL(offer.clubCents)}{u ? `/${u}` : ""}
        </p>
      )}
    </div>
  );
}

function extras(o: Offer): string[] {
  return [o.limitPerCustomer ? `Limite de ${o.limitPerCustomer} por cliente` : null, o.paymentNote, o.conditions].filter((x): x is string => !!x);
}

export function StorefrontView({ data, qrSvg }: { data: StorefrontViewData; qrSvg: string }) {
  const { store, colors, campaigns, slug } = data;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [list, setList] = useState<Record<string, number>>({});
  const [listOpen, setListOpen] = useState(false);
  const searchId = useId();
  const storageKey = `ev-lista:${slug}`;

  const allItems = useMemo(() => campaigns.flatMap((c) => c.items.map((i) => ({ ...i, campaignId: c.id }))), [campaigns]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const i of allItems) s.add(i.category ?? OTHER);
    return [...s].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, "pt-BR")));
  }, [allItems]);

  // lista salva neste aparelho (só itens que ainda estão na vitrine)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, number>;
      const ok: Record<string, number> = {};
      for (const [id, q] of Object.entries(saved)) if (byId.has(id) && Number.isInteger(q) && q > 0) ok[id] = Math.min(q, 99);
      setList(ok);
    } catch { /* ignora */ }
  }, [storageKey, byId]);
  const updateList = (fn: (l: Record<string, number>) => Record<string, number>) => setList((l) => {
    const n = fn(l);
    try { localStorage.setItem(storageKey, JSON.stringify(n)); } catch { /* ignora */ }
    return n;
  });
  const toggle = (id: string) => updateList((l) => { const n = { ...l }; if (n[id]) delete n[id]; else n[id] = 1; return n; });
  const setQty = (id: string, q: number) => updateList((l) => { const n = { ...l }; if (q <= 0) delete n[id]; else n[id] = Math.min(q, 99); return n; });

  const listEntries = Object.entries(list).filter(([id]) => byId.has(id));
  const listCount = listEntries.reduce((n, [, q]) => n + q, 0);

  const q = norm(query.trim());
  const matches = (i: StorefrontViewItem) =>
    (!category || (i.category ?? OTHER) === category) &&
    (!q || norm([i.name, i.brand, i.sizeLabel, i.category].filter(Boolean).join(" ")).includes(q));
  const visibleCount = allItems.filter(matches).length;

  const message = (() => {
    const lines = listEntries.map(([id, qty]) => {
      const i = byId.get(id)!;
      const desc = [i.brand, i.sizeLabel].filter(Boolean).join(", ");
      return `• ${qty}x ${i.name}${desc ? ` (${desc})` : ""} — ${i.offerText}`;
    });
    return [
      `Olá, ${store.name}! Vi as ofertas na vitrine online e gostaria de saber se estes produtos estão disponíveis:`,
      "",
      ...lines,
      "",
      "É só um pedido para a loja: sei que a disponibilidade e os preços são confirmados por vocês e que nenhum pagamento foi feito pelo site.",
      data.pageUrl,
    ].join("\n");
  })();
  const waHref = store.whatsappNumber ? `https://wa.me/${store.whatsappNumber}?text=${encodeURIComponent(message)}` : null;
  const singleCampaign = campaigns.length === 1 ? campaigns[0]!.id : null;

  const share = async () => {
    sendEvent(slug, "share", data.source, singleCampaign);
    const shareData = { title: `Ofertas ${store.name}`, text: `Veja as ofertas do ${store.name}`, url: data.pageUrl };
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share(shareData); return; }
      await navigator.clipboard.writeText(data.pageUrl);
      toast("Link da vitrine copiado.", "success");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast(`Copie o link: ${data.pageUrl}`, "info");
    }
  };
  const copyList = async () => {
    try { await navigator.clipboard.writeText(message); toast("Lista copiada. Cole na conversa com a loja.", "success"); }
    catch { toast("Não foi possível copiar automaticamente.", "error"); }
  };

  const btn = "inline-flex min-h-tap items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <div className="min-h-dvh bg-surface-alt text-ink">
      {data.isDemo && <p className="bg-warning/30 px-4 py-2 text-center text-xs font-semibold">Dados de demonstração — esta vitrine não é de uma loja real.</p>}
      <header style={{ background: colors.primary, color: colors.onPrimary }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          {store.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={`Logo ${store.name}`} className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">{store.name}</h1>
            {store.slogan && <p className="text-sm opacity-90">{store.slogan}</p>}
          </div>
          <button type="button" onClick={share} className={`${btn} shrink-0 border border-current bg-transparent px-3`} aria-label="Compartilhar a vitrine">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-5xl px-4 pb-28 pt-4">
        <section aria-label="Informações da loja" className="rounded-2xl bg-surface p-4 text-sm shadow-card">
          <dl className="grid gap-2 sm:grid-cols-2">
            {store.address && <div><dt className="font-semibold">Endereço</dt><dd className="text-ink-muted">{store.address}</dd></div>}
            {store.hours && <div><dt className="font-semibold">Horário</dt><dd className="text-ink-muted">{store.hours}</dd></div>}
            {store.whatsapp && (
              <div><dt className="font-semibold">WhatsApp</dt><dd>
                {store.whatsappNumber
                  ? <a className="underline" href={`https://wa.me/${store.whatsappNumber}`} target="_blank" rel="noopener noreferrer" onClick={() => sendEvent(slug, "whatsapp_click", data.source, singleCampaign)}>{store.whatsapp}</a>
                  : store.whatsapp}
              </dd></div>
            )}
            {store.phone && <div><dt className="font-semibold">Telefone</dt><dd>{store.phoneDigits ? <a className="underline" href={`tel:${store.phoneDigits}`}>{store.phone}</a> : store.phone}</dd></div>}
          </dl>
        </section>

        {allItems.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-surface p-8 text-center shadow-card">
            <h2 className="font-display text-lg font-bold">Nenhuma oferta ativa no momento</h2>
            <p className="mt-1 text-sm text-ink-muted">Volte em breve: as próximas ofertas aparecem aqui assim que forem publicadas pela loja.</p>
          </section>
        ) : (
          <>
            <div className="sticky top-0 z-10 -mx-4 mt-4 bg-surface-alt/95 px-4 py-3 backdrop-blur">
              <label htmlFor={searchId} className="sr-only">Buscar produto</label>
              <input
                id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto (ex.: arroz, café)"
                className="min-h-tap w-full rounded-xl border border-line-strong bg-surface px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              />
              {categories.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por categoria">
                  {[null, ...categories].map((cat) => {
                    const on = category === cat;
                    return (
                      <button key={cat ?? "_todas"} type="button" aria-pressed={on} onClick={() => setCategory(cat)}
                        className={`min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}>
                        {cat ?? "Todas"}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="sr-only" aria-live="polite">{q || category ? `${visibleCount} ${visibleCount === 1 ? "produto encontrado" : "produtos encontrados"}` : ""}</p>
            </div>

            {visibleCount === 0 && (
              <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm shadow-card">
                Nenhum produto encontrado{query.trim() ? <> para “{query.trim()}”</> : null}.{" "}
                <button type="button" className="font-semibold underline" onClick={() => { setQuery(""); setCategory(null); }}>Limpar busca</button>
              </p>
            )}

            {campaigns.map((cp) => {
              const items = cp.items.filter(matches);
              if (!items.length) return null;
              const groups = new Map<string, StorefrontViewItem[]>();
              for (const i of items) { const k = i.category ?? OTHER; groups.set(k, [...(groups.get(k) ?? []), i]); }
              const ordered = [...groups.entries()].sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, "pt-BR")));
              return (
                <section key={cp.id} aria-labelledby={`cp-${cp.id}`} className="mt-6">
                  <h2 id={`cp-${cp.id}`} className="font-display text-xl font-extrabold">{cp.title}</h2>
                  {cp.subtitle && <p className="text-sm text-ink-muted">{cp.subtitle}</p>}
                  {cp.validity && <p className="mt-1 inline-block rounded-lg bg-highlight/50 px-2 py-1 text-xs font-semibold">{cp.validity}</p>}
                  {ordered.map(([cat, list2]) => (
                    <div key={cat} className="mt-4">
                      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">{cat}</h3>
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {list2.map((i) => {
                          const inList = !!list[i.id];
                          const sub = [i.brand, i.sizeLabel].filter(Boolean).join(" · ");
                          const ex = extras(i.offer);
                          return (
                            <li key={i.id} className={`flex flex-col rounded-2xl bg-surface p-3 shadow-card ${i.highlight ? "ring-2" : ""}`} style={i.highlight ? { ["--tw-ring-color" as string]: colors.price } : undefined}>
                              <div className={`mb-2 flex items-center justify-center overflow-hidden rounded-xl ${i.imageUrl ? "aspect-square bg-white" : "h-12 bg-surface-alt"}`}>
                                {i.imageUrl
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={i.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                                  : <span aria-hidden="true" className="px-2 text-center text-xs text-ink-muted">Sem foto</span>}
                              </div>
                              {i.highlight && <p className="mb-1 text-[11px] font-bold uppercase" style={{ color: colors.price }}>Destaque</p>}
                              <h4 className="text-sm font-semibold leading-snug">{i.name}</h4>
                              {sub && <p className="text-xs text-ink-muted">{sub}</p>}
                              <div className="mt-2 flex-1">
                                <p className="sr-only">{i.offerText}</p>
                                <Price offer={i.offer} unit={i.unit} color={colors.price} />
                                {ex.length > 0 && <p aria-hidden="true" className="mt-1.5 text-[11px] leading-snug text-ink-muted">{ex.join(" · ")}</p>}
                              </div>
                              <button type="button" aria-pressed={inList} onClick={() => toggle(i.id)}
                                className={`${btn} mt-3 w-full border px-2 ${inList ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}>
                                {inList ? <>Na lista<span aria-hidden="true"> ✓</span></> : "Quero este"}<span className="sr-only">: {i.name}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              );
            })}
          </>
        )}

        <footer className="mt-10 grid gap-4 rounded-2xl bg-surface p-4 text-xs text-ink-muted shadow-card sm:grid-cols-[auto,1fr] sm:items-center">
          <figure className="mx-auto w-36 sm:mx-0">
            <div className="w-36 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={`QR code com o endereço desta vitrine: ${data.pageUrl}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <figcaption className="mt-1 text-center">Aponte a câmera para abrir esta vitrine</figcaption>
          </figure>
          <div className="space-y-2">
            <p className="break-all font-semibold text-ink">{data.pageUrl}</p>
            <p>Preços válidos para a loja {store.name}, nas datas indicadas, ou enquanto durarem os estoques. Imagens meramente ilustrativas.</p>
            {store.legalText && <p>{store.legalText}</p>}
            <p>A lista de interesse é só uma mensagem para a loja pelo WhatsApp: não é uma compra e nenhum pagamento é feito por esta página.</p>
          </div>
        </footer>
      </main>

      {listCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface shadow-card">
          <div className="mx-auto max-w-5xl px-4 py-3">
            {listOpen && (
              <section id="lista-interesse" aria-label="Minha lista de interesse" className="mb-3 max-h-[55dvh] overflow-y-auto">
                <h2 className="font-display text-base font-bold">Minha lista de interesse</h2>
                <p className="mb-2 text-xs text-ink-muted">Envie para a loja confirmar disponibilidade e preço. Não é uma compra: nenhum pagamento é feito aqui.</p>
                <ul className="divide-y divide-line">
                  {listEntries.map(([id, qty]) => {
                    const i = byId.get(id)!;
                    return (
                      <li key={id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{i.name}</p>
                          <p className="truncate text-xs text-ink-muted">{i.offerText}</p>
                        </div>
                        <div className="flex items-center gap-1" role="group" aria-label={`Quantidade de ${i.name}`}>
                          <button type="button" className={`${btn} h-11 w-11 border border-line-strong px-0`} aria-label={`Diminuir ${i.name}`} onClick={() => setQty(id, qty - 1)}>−</button>
                          <span className="w-6 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                          <button type="button" className={`${btn} h-11 w-11 border border-line-strong px-0`} aria-label={`Aumentar ${i.name}`} onClick={() => setQty(id, qty + 1)}>+</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-expanded={listOpen} aria-controls="lista-interesse" onClick={() => setListOpen((o) => !o)} className={`${btn} border border-line-strong bg-surface`}>
                Minha lista ({listCount})
              </button>
              {waHref ? (
                <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => sendEvent(slug, "whatsapp_click", data.source, singleCampaign)}
                  className={`${btn} flex-1`} style={{ background: colors.primary, color: colors.onPrimary }}>
                  Enviar lista pelo WhatsApp
                </a>
              ) : (
                <button type="button" onClick={copyList} className={`${btn} flex-1`} style={{ background: colors.primary, color: colors.onPrimary }}>Copiar lista</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
