import { cookies, headers } from "next/headers";
import { FORMATS } from "@/domain/formats";
import { getTemplate } from "@/templates/registry";
import { computePieceLayout, PieceRenderer } from "@/render/PieceRenderer";
import { ScaledPreview } from "@/render/ScaledPreview";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { getPublicPreview, loadPreviewBundle } from "@/server/services/preview-links";
import { ApprovalShell, DecisionForm, DecisionRecorded, PinForm } from "@/components/agency/ApprovalForms";

// Prévia pública para aprovação do cliente (link com validade, PIN opcional, versão fixa da campanha).
// Mostra só as peças daquela versão e o nome da loja. Sem sessão; nada de outros dados da conta.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const fmt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jar = await cookies();
  const pinCookies = jar.getAll().filter((c) => c.name.startsWith("ev_pv_")).map((c) => c.value);
  let countView = true;
  try { hitRateLimit(`pv-view:${clientIp({ headers: await headers() } as unknown as Request)}:${token.slice(0, 12)}`, 60, 60_000); } catch { countView = false; }
  const pv = await getPublicPreview(token, { cookie: pinCookies, countView });

  if (pv.state === "invalid" || pv.state === "expired" || pv.state === "revoked") {
    const msg = pv.state === "expired" ? "Este link de prévia expirou." : pv.state === "revoked" ? "Este link de prévia foi cancelado pela equipe." : "Link de prévia inválido.";
    return <ApprovalShell title={msg}><p className="text-sm text-ink-muted">Peça um link novo para quem enviou a prévia.</p></ApprovalShell>;
  }
  if (pv.state === "locked") {
    return <ApprovalShell title="Link bloqueado temporariamente"><p className="text-sm text-ink-muted">Houve muitas tentativas com PIN incorreto. Tente novamente depois de {fmt(pv.until)}.</p></ApprovalShell>;
  }
  if (pv.state === "pin_required") {
    return <ApprovalShell title="Digite o PIN para ver a prévia"><PinForm token={token} /></ApprovalShell>;
  }
  if (pv.state === "outdated") {
    return (
      <ApprovalShell title="Esta prévia está desatualizada" subtitle={`${pv.storeName} · ${pv.campaignName}`}>
        <p className="text-sm text-ink-muted">A campanha foi alterada depois que este link foi enviado. Para aprovar, peça à equipe um link da versão mais recente.</p>
      </ApprovalShell>
    );
  }

  if (pv.state !== "ok") return null;
  const bundle = await loadPreviewBundle(token, pinCookies);
  const template = getTemplate(bundle.templateId, bundle.templateVersion);
  const pieces = bundle.pieces.map((p) => {
    const format = FORMATS[p.format];
    const layout = template ? computePieceLayout(bundle.campaign, template, format, p.overrides) : null;
    return { ...p, format, pages: layout?.pages.length ?? 1, layout };
  });
  const GAP = 24;

  return (
    <ApprovalShell title={pv.campaignName} subtitle={`${pv.storeName} · prévia para aprovação (versão ${pv.version})`} wide>
      <p className="mb-4 text-sm text-ink-muted">Link válido até {fmt(pv.expiresAt)}. Confira produtos, preços e datas em cada peça. <a href="#resposta" className="font-semibold text-brand underline">Ir para a resposta</a></p>
      {!template && <p role="alert" className="text-sm text-danger">O modelo desta campanha não está disponível para prévia.</p>}
      <div className="flex flex-col gap-6">
        {template && pieces.map((p) => (
          <section key={p.format.id} aria-label={p.format.label} className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
            <h2 className="mb-3 font-display text-lg font-bold">{p.format.label}{p.pages > 1 ? ` · ${p.pages} páginas` : ""}</h2>
            <div className="mx-auto" style={{ maxWidth: Math.min(p.format.widthPx, 720) }}>
              <ScaledPreview width={p.format.widthPx} height={p.pages * p.format.heightPx + (p.pages - 1) * GAP} label={`Prévia: ${p.format.label}`}>
                <PieceRenderer campaign={bundle.campaign} template={template} format={p.format} overrides={p.overrides} pageIndex="all" stackGap={GAP} layout={p.layout ?? undefined} />
              </ScaledPreview>
            </div>
          </section>
        ))}
        {template && !pieces.length && <p className="text-sm text-ink-muted">Nenhuma peça habilitada nesta campanha.</p>}
      </div>
      <div id="resposta" className="mt-8 scroll-mt-4">
        {pv.decision ? <DecisionRecorded decision={pv.decision.decision} name={pv.decision.name} comment={pv.decision.comment} at={fmt(pv.decision.at)} /> : <DecisionForm token={token} />}
      </div>
    </ApprovalShell>
  );
}
