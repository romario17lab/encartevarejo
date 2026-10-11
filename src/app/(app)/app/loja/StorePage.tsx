"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, ErrorState, Input, Select, Tabs, Textarea, toast } from "@/components/ui";
import { Checkbox, ImageUpload, LoadingBlock, PageHeader } from "@/components/app/common";
import { demoCampaign } from "@/components/app/demo";
import { PieceRenderer, ScaledPreview } from "@/render/PieceRenderer";
import { FORMATS } from "@/domain/formats";
import { DEFAULT_TEMPLATE_ID, getTemplate, listTemplates } from "@/templates/registry";
import { api, asList, assetUrl, type BrandColors, type BrandKit, type Store } from "@/lib/client/api";
import { contrastRatio, fmtRatio } from "@/lib/client/color";
import { SEGMENTS, WEEKDAYS } from "@/lib/client/format";
import { useMe } from "@/lib/client/hooks";

const COLOR_LABEL: Record<keyof BrandColors, string> = { primary: "Principal", secondary: "Secundária", accent: "Destaque", text: "Texto", background: "Fundo" };

export function StorePage({ welcome }: { welcome: boolean }) {
  const { storeId, can, reload: reloadMe } = useMe();
  const [tab, setTab] = useState<"dados" | "marca">("dados");
  const [store, setStore] = useState<Store | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const stores = asList<Store>(await api.get("/api/stores"), "stores");
      const s = stores.find((x) => x.id === storeId) ?? stores[0] ?? null;
      setStore(s);
      const kits = asList<BrandKit>(await api.get("/api/brand-kits"), "brandKits", "kits");
      setKit(kits.find((k) => k.id === s?.brandKitId) ?? kits[0] ?? null);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);

  return (
    <>
      <PageHeader title="Loja e identidade visual" description="Esses dados aparecem no rodapé dos encartes, posts e cartazes." />
      {welcome && (
        <div role="status" className="mb-4 rounded-2xl border border-brand/30 bg-brand-soft p-4 text-sm">
          <p className="font-semibold">Conta criada! Complete os dados da loja.</p>
          <p className="mt-1">Telefone, WhatsApp, endereço e horários aparecem nos materiais. Depois, <Link href="/app/produtos?novo=1" className="font-semibold underline">cadastre seus produtos</Link>.</p>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "dados", label: "Dados da loja" }, { value: "marca", label: "Identidade visual" }]} className="mb-4" />
      {error ? <ErrorState message={error} onRetry={load} /> : !store ? <LoadingBlock /> : tab === "dados" ? (
        <StoreForm store={store} canEdit={can("stores.manage")} onSaved={(s) => { setStore(s); void reloadMe(); }} />
      ) : kit ? (
        <BrandForm kit={kit} store={store} canEdit={can("brand.manage")} onSaved={setKit} />
      ) : <ErrorState message="Identidade visual não encontrada." onRetry={load} />}
    </>
  );
}

function parseHours(v: string | null | undefined) {
  const m = v?.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  return m ? { open: m[1], close: m[2], closed: false } : { open: "08:00", close: "20:00", closed: true };
}

function StoreForm({ store, canEdit, onSaved }: { store: Store; canEdit: boolean; onSaved: (s: Store) => void }) {
  const [f, setF] = useState(() => ({
    name: store.name, segment: store.segment ?? "supermercado", phone: store.phone ?? "", whatsapp: store.whatsapp ?? "", email: store.email ?? "",
    address: { ...store.address }, socials: { ...store.socials }, hoursNote: store.hoursNote ?? "",
  }));
  const [hours, setHours] = useState(() => Object.fromEntries(WEEKDAYS.map((_, i) => [String(i), parseHours(store.hours?.[String(i)])])));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const addr = (k: keyof Store["address"]) => ({ value: f.address[k] ?? "", onChange: (e: { target: { value: string } }) => setF({ ...f, address: { ...f.address, [k]: e.target.value } }) });
  const soc = (k: keyof Store["socials"]) => ({ value: f.socials[k] ?? "", onChange: (e: { target: { value: string } }) => setF({ ...f, socials: { ...f.socials, [k]: e.target.value } }) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const [d, h] of Object.entries(hours)) if (!h.closed && h.open >= h.close) errs[`h${d}`] = "O fechamento precisa ser depois da abertura.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {
        ...f, phone: f.phone || null, whatsapp: f.whatsapp, email: f.email, hoursNote: f.hoursNote || null,
        hours: Object.fromEntries(Object.entries(hours).map(([d, h]) => [d, h.closed ? null : `${h.open}-${h.close}`])),
      };
      const res = await api.patch<Store | { store: Store }>(`/api/stores/${store.id}`, body);
      onSaved("store" in res && res.store ? res.store : (res as Store));
      toast("Dados da loja salvos.", "success");
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={save}>
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        {!canEdit && <p className="text-sm text-ink-muted">Somente administradores podem alterar os dados da loja.</p>}
        <Card className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome da loja" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Segmento" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} options={SEGMENTS} />
          <Input label="Telefone" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 3333-4444" />
          <Input label="WhatsApp" type="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="(11) 99999-0000" hint="Usado no botão de pedido da vitrine." />
          <Input label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Card>
        <Card>
          <h2 className="mb-3 font-display font-bold">Endereço</h2>
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-4"><Input label="Rua / avenida" {...addr("street")} /></div>
            <div className="sm:col-span-2"><Input label="Número" {...addr("number")} /></div>
            <div className="sm:col-span-3"><Input label="Bairro" {...addr("district")} /></div>
            <div className="sm:col-span-3"><Input label="Complemento" {...addr("complement")} /></div>
            <div className="sm:col-span-3"><Input label="Cidade" {...addr("city")} /></div>
            <div className="sm:col-span-1"><Input label="UF" maxLength={2} {...addr("state")} /></div>
            <div className="sm:col-span-2"><Input label="CEP" inputMode="numeric" {...addr("zip")} /></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-display font-bold">Redes sociais e site</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Instagram" {...soc("instagram")} placeholder="@sualoja" />
            <Input label="Facebook" {...soc("facebook")} placeholder="facebook.com/sualoja" />
            <Input label="TikTok" {...soc("tiktok")} placeholder="@sualoja" />
            <Input label="Site" {...soc("website")} placeholder="https://" />
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-display font-bold">Horário de funcionamento</h2>
          <ul className="flex flex-col gap-3">
            {WEEKDAYS.map((day, i) => {
              const h = hours[String(i)];
              const set = (p: Partial<typeof h>) => setHours({ ...hours, [String(i)]: { ...h, ...p } });
              return (
                <li key={day} className="grid grid-cols-[90px_1fr] items-center gap-2 sm:grid-cols-[120px_120px_1fr]">
                  <span className="text-sm font-semibold">{day}</span>
                  <Checkbox label="Fechado" checked={h.closed} onChange={(v) => set({ closed: v })} />
                  {!h.closed && (
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      <label className="sr-only" htmlFor={`o${i}`}>Abre às ({day})</label>
                      <input id={`o${i}`} type="time" value={h.open} onChange={(e) => set({ open: e.target.value })} className="h-10 rounded-lg border border-line bg-surface px-2" />
                      <span aria-hidden>às</span>
                      <label className="sr-only" htmlFor={`c${i}`}>Fecha às ({day})</label>
                      <input id={`c${i}`} type="time" value={h.close} onChange={(e) => set({ close: e.target.value })} className="h-10 rounded-lg border border-line bg-surface px-2" />
                    </div>
                  )}
                  {errors[`h${i}`] && <p className="col-span-full text-sm text-danger">{errors[`h${i}`]}</p>}
                </li>
              );
            })}
          </ul>
          <div className="mt-4"><Input label="Observação de horário" value={f.hoursNote} onChange={(e) => setF({ ...f, hoursNote: e.target.value })} placeholder="Ex.: Feriados das 8h às 13h" maxLength={120} /></div>
        </Card>
        {canEdit && <div className="flex justify-end"><Button type="submit" loading={saving}>Salvar dados da loja</Button></div>}
      </fieldset>
    </form>
  );
}

function BrandForm({ kit, store, canEdit, onSaved }: { kit: BrandKit; store: Store; canEdit: boolean; onSaved: (k: BrandKit) => void }) {
  const [f, setF] = useState(() => ({ name: kit.name, logoAssetId: kit.logoAssetId, colors: { ...kit.colors }, slogan: kit.slogan ?? "", legalText: kit.legalText ?? "" }));
  const [logoUrl, setLogoUrl] = useState<string | null>(kit.logoUrl ?? assetUrl(kit.logoAssetId));
  const [saving, setSaving] = useState(false);
  const templates = listTemplates();
  const [templateId, setTemplateId] = useState(getTemplate(DEFAULT_TEMPLATE_ID) ? DEFAULT_TEMPLATE_ID : templates[0]?.id ?? DEFAULT_TEMPLATE_ID);

  const warnings = useMemo(() => {
    const c = f.colors; const out: string[] = [];
    const check = (a: string, b: string, what: string) => { const r = contrastRatio(a, b); if (r != null && r < 4.5) out.push(`${what}: contraste ${fmtRatio(r)} (recomendado 4,5:1 ou mais).`); };
    check(c.text, c.background, "Texto sobre o fundo");
    check("#FFFFFF", c.primary, "Texto branco sobre a cor principal");
    check(c.text, c.secondary, "Texto sobre a cor secundária");
    return out;
  }, [f.colors]);

  const campaign = useMemo(() => demoCampaign(4, { storeName: store.name, logoUrl, colors: f.colors, phone: store.phone, whatsapp: store.whatsapp }), [store, logoUrl, f.colors]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch<BrandKit | { brandKit: BrandKit }>(`/api/brand-kits/${kit.id}`, { ...f, slogan: f.slogan || null, legalText: f.legalText || null });
      onSaved("brandKit" in res && res.brandKit ? res.brandKit : (res as BrandKit));
      toast("Identidade visual salva.", "success");
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setSaving(false); }
  };
  const fmt = FORMATS.post_quadrado;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <form onSubmit={save}>
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <Card>
            <ImageUpload label="Logo" value={logoUrl} defaultNote="Logo da loja"
              onUploaded={(a) => { setF({ ...f, logoAssetId: a.id }); setLogoUrl(a.url || assetUrl(a.id)); }}
              onClear={() => { setF({ ...f, logoAssetId: null }); setLogoUrl(null); }} />
          </Card>
          <Card>
            <h2 className="mb-3 font-display font-bold">Cores</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(Object.keys(COLOR_LABEL) as Array<keyof BrandColors>).map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <label htmlFor={`c-${k}`} className="text-sm font-medium">{COLOR_LABEL[k]}</label>
                  <div className="flex items-center gap-2">
                    <input id={`c-${k}`} type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.colors[k]) ? f.colors[k] : "#000000"} onChange={(e) => setF({ ...f, colors: { ...f.colors, [k]: e.target.value.toUpperCase() } })} className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-line" />
                    <input aria-label={`${COLOR_LABEL[k]} (hexadecimal)`} value={f.colors[k]} onChange={(e) => setF({ ...f, colors: { ...f.colors, [k]: e.target.value } })} className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2 font-mono text-sm uppercase" maxLength={7} />
                  </div>
                </div>
              ))}
            </div>
            <div aria-live="polite" className="mt-3">
              {warnings.length ? (
                <ul className="rounded-xl border border-warning bg-warning/10 p-3 text-sm">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
              ) : <p className="text-sm text-success">Contraste das cores adequado para leitura.</p>}
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <Input label="Slogan" value={f.slogan} onChange={(e) => setF({ ...f, slogan: e.target.value })} maxLength={120} placeholder="Ex.: O preço baixo do seu bairro" />
            <Textarea label="Texto legal (rodapé)" value={f.legalText} onChange={(e) => setF({ ...f, legalText: e.target.value })} maxLength={400} hint="Ex.: Imagens meramente ilustrativas. Ofertas válidas enquanto durarem os estoques." />
          </Card>
          {canEdit && <div className="flex justify-end"><Button type="submit" loading={saving}>Salvar identidade</Button></div>}
          {!canEdit && <p className="text-sm text-ink-muted">Somente administradores podem alterar a identidade visual.</p>}
        </fieldset>
      </form>
      <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Prévia">
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-display font-bold">Prévia</h2>
            {templates.length > 1 && (
              <select aria-label="Modelo da prévia" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <ScaledPreview width={fmt.widthPx} height={fmt.heightPx} label="Prévia de um post com as cores da loja (dados de demonstração)">
            <PieceRenderer campaign={campaign} template={{ id: templateId }} format={fmt} />
          </ScaledPreview>
          <p className="mt-2 text-xs text-ink-muted">Dados de demonstração. Alguns modelos usam paleta própria e aplicam só o logo e os contatos.</p>
        </Card>
      </aside>
    </div>
  );
}
