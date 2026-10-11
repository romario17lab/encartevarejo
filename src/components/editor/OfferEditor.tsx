"use client";
import { useId } from "react";
import { Input, PriceInput, cx } from "@/components/ui";
import { describeOffer, PRICE_MODES, validateOffer, type Offer, type OfferIssue, type PriceMode, type Unit } from "@/domain/offer";
import { discountPercent } from "@/domain/money";

export const MODE_LABEL: Record<PriceMode, string> = {
  simple: "Preço simples",
  from_to: "De / por",
  min_qty: "Quantidade mínima",
  combo: "Leve X por R$",
  club: "Preço de clube",
};
const MODE_HELP: Record<PriceMode, string> = {
  simple: "Ex.: R$ 4,99",
  from_to: "Ex.: De R$ 6,99 por R$ 4,99 — o preço anterior precisa ser real",
  min_qty: "Ex.: A partir de 3 un, R$ 4,49 cada",
  combo: "Ex.: Leve 3 por R$ 12,00",
  club: "Ex.: R$ 5,49 · Clube: R$ 4,49",
};

const intOrNull = (v: string) => { const n = parseInt(v.replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : null; };

/** Editor de mecânica de preço com validação inline (validateOffer). */
export function OfferEditor({ offer, unit, onChange, costCents, minMarginBp, disabled }: {
  offer: Offer; unit: Unit | null; onChange: (o: Offer) => void; costCents?: number | null; minMarginBp?: number | null; disabled?: boolean;
}) {
  const uid = useId();
  const issues = validateOffer(offer, { unit, costCents, minMarginBp });
  const err = (f: OfferIssue["field"]) => issues.find((i) => i.field === f && i.level === "error")?.message ?? null;
  const set = (p: Partial<Offer>) => onChange({ ...offer, ...p });
  const pct = offer.mode === "from_to" && offer.regularCents && offer.priceCents ? discountPercent(offer.regularCents, offer.priceCents) : 0;
  const preview = describeOffer(offer, unit);

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="sr-only">Oferta</legend>
      <div>
        <span id={`${uid}-mode`} className="text-sm font-medium">Tipo de oferta</span>
        <div role="radiogroup" aria-labelledby={`${uid}-mode`} className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PRICE_MODES.map((m) => (
            <button type="button" key={m} role="radio" aria-checked={offer.mode === m} onClick={() => set({ mode: m })}
              className={cx("rounded-lg border px-2 py-2 text-left text-sm font-semibold", offer.mode === m ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:bg-surface-alt")}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-muted">{MODE_HELP[offer.mode]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {offer.mode === "from_to" && <PriceInput label="De (preço anterior)" required value={offer.regularCents} onChange={(v) => set({ regularCents: v })} error={err("regularCents")} />}
        {offer.mode !== "combo" && (
          <PriceInput label={offer.mode === "from_to" ? "Por (preço da oferta)" : offer.mode === "club" ? "Preço normal" : offer.mode === "min_qty" ? "Preço cada" : "Preço"} required
            value={offer.priceCents} onChange={(v) => set({ priceCents: v })} error={err("priceCents")} />
        )}
        {offer.mode === "min_qty" && <Input label="A partir de (qtd.)" inputMode="numeric" value={offer.minQty ?? ""} onChange={(e) => set({ minQty: intOrNull(e.target.value) })} error={err("minQty")} />}
        {offer.mode === "combo" && <>
          <Input label="Leve (qtd.)" inputMode="numeric" value={offer.comboQty ?? ""} onChange={(e) => set({ comboQty: intOrNull(e.target.value) })} error={err("comboQty")} />
          <PriceInput label="Por (total do combo)" required value={offer.comboCents} onChange={(v) => set({ comboCents: v })} error={err("comboCents")} />
        </>}
        {offer.mode === "club" && <>
          <PriceInput label="Preço de clube" required value={offer.clubCents} onChange={(v) => set({ clubCents: v })} error={err("clubCents")} />
          <Input label="Nome do clube" value={offer.clubName ?? ""} maxLength={40} onChange={(e) => set({ clubName: e.target.value || null })} placeholder="Ex.: Clube Vantagens" />
        </>}
        {(offer.mode === "min_qty" || offer.mode === "combo" || offer.mode === "simple") && (
          <PriceInput label="Preço normal (opcional)" value={offer.regularCents} onChange={(v) => set({ regularCents: v })} hint={offer.mode === "combo" ? "Usado para conferir se o combo compensa." : "Não aparece como “de/por”."} />
        )}
      </div>

      <details className="rounded-xl border border-line px-3 py-2" open={!!(offer.limitPerCustomer || offer.paymentNote || offer.conditions)}>
        <summary className="cursor-pointer text-sm font-semibold">Limite, pagamento e condições</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Limite por cliente" inputMode="numeric" value={offer.limitPerCustomer ?? ""} onChange={(e) => set({ limitPerCustomer: intOrNull(e.target.value) })} placeholder="Ex.: 3" error={err("limitPerCustomer")} />
          <Input label="Forma de pagamento" value={offer.paymentNote ?? ""} maxLength={80} onChange={(e) => set({ paymentNote: e.target.value || null })} placeholder="Ex.: à vista, no Pix" />
          <div className="sm:col-span-2"><Input label="Condições" value={offer.conditions ?? ""} maxLength={160} onChange={(e) => set({ conditions: e.target.value || null })} placeholder="Ex.: Válido para sabores selecionados" /></div>
        </div>
      </details>

      <div aria-live="polite" className="flex flex-col gap-1">
        {preview && <p className="text-sm"><span className="text-ink-muted">Como aparece: </span><strong>{preview}</strong>{pct > 0 && <span className="text-success"> ({pct}% de desconto)</span>}</p>}
        {issues.filter((i) => i.field === "unit").map((i) => <p key={i.message} className="text-sm text-danger">{i.message}</p>)}
        {issues.filter((i) => i.level === "warning").map((i) => <p key={i.message} className="text-sm text-ink">⚠ {i.message}</p>)}
      </div>
    </fieldset>
  );
}
