// TV da loja: pareamento, token do aparelho, agendamento (fuso de Brasília), validade, isolamento e permissões.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { storage } from "@/server/storage";
import { createCampaign, saveCampaign } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { createStore } from "@/server/services/stores";
import {
  createScreen, createScreenLink, devicePlaylist, getScreenDetail, listScreens, pairDevice, PAIRING_ALPHABET, regeneratePairing, revokeScreen, savePlaylist,
} from "@/server/services/tv";
import { isScheduleActive, parseHours, spClock, spDateEnd, spDateStart, spYmd } from "@/server/tv/schedule";
import { clearAllRateLimits } from "@/server/auth/rate-limit";
import * as screensRoute from "@/app/api/tv/screens/route";
import * as screenRoute from "@/app/api/tv/screens/[id]/route";
import * as playlistRoute from "@/app/api/tv/screens/[id]/playlist/route";
import * as revokeRoute from "@/app/api/tv/screens/[id]/revoke/route";
import * as pairRoute from "@/app/api/tv/pair/route";
import * as devicePlaylistRoute from "@/app/api/tv/playlist/route";
import * as mediaRoute from "@/app/api/tv/media/[assetId]/route";
import { addMember, call, days, makeOrg, makeProduct, req, templateId, uid, type TestOrg } from "./helpers";

async function publishedCampaign(org: TestOrg, opts: { start?: Date; end?: Date; storeId?: string; name?: string } = {}) {
  const p = await makeProduct(org, { name: `Arroz ${uid()}`, unit: "pct", regularCents: 2990, promoCents: 2490 });
  const st = await createCampaign(org.ctx, {
    storeId: opts.storeId ?? org.storeId, name: opts.name ?? "Semana", templateId: templateId(),
    startsAt: (opts.start ?? days(-1)).toISOString(), endsAt: (opts.end ?? days(3)).toISOString(), productIds: [p.id],
  });
  await transitionCampaign(org.ctx, st.campaign.id, "approve");
  await transitionCampaign(org.ctx, st.campaign.id, "publish");
  return st.campaign.id;
}

async function pairedScreen(org: TestOrg, settings: { orientation?: "horizontal" | "vertical" } = {}) {
  const screen = await createScreen(org.ctx, { name: "TV do caixa", storeId: org.storeId, ...settings });
  const { token } = await pairDevice(screen.pairingCode!);
  return { screen, token };
}

const playlistReq = (token: string | null, etag?: string) =>
  req("GET", "/api/tv/playlist", { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(etag ? { "if-none-match": etag } : {}) } });

/** 10:00 (Brasília) de amanhã: dentro da validade das campanhas de teste (ontem → daqui a 3 dias). */
const tomorrowAt = (hh: number, mm = 0) => new Date(spDateStart(spYmd(days(1))).getTime() + (hh * 60 + mm) * 60_000);

describe("TV da loja", () => {
  beforeEach(() => clearAllRateLimits());

  describe("pareamento", () => {
    it("código de 6 caracteres sem letras ambíguas, uso único, aceita minúsculas e hífen", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const screen = await createScreen(org.ctx, { name: "TV 1", storeId: org.storeId });
      const code = screen.pairingCode!;
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect([...code].every((c) => PAIRING_ALPHABET.includes(c))).toBe(true);
      expect(PAIRING_ALPHABET).not.toMatch(/[01OIL25SZ8B6G]/);
      expect(new Date(screen.pairingExpiresAt!).getTime() - Date.now()).toBeGreaterThan(14 * 60_000);

      const typed = `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`;
      const r = await call(pairRoute.POST, req("POST", "/api/tv/pair", { body: { code: typed } }));
      expect(r.status).toBe(200);
      expect(r.json.token).toMatch(/^tvd_/);
      expect(r.json.screen.name).toBe("TV 1");
      const [row] = await getDb().select().from(schema.tvScreens).where(eq(schema.tvScreens.id, screen.id));
      expect(row!.deviceTokenHash).not.toBe(r.json.token); // só o hash
      expect(row!.deviceTokenHash).toHaveLength(64);
      expect(row!.pairingCode).toBeNull();

      const again = await call(pairRoute.POST, req("POST", "/api/tv/pair", { body: { code } }));
      expect(again.status).toBe(404);
      expect(again.json.error.message).toMatch(/inválido ou vencido/);
    });

    it("código vence em 15 minutos e pode ser gerado de novo (o anterior deixa de valer)", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const screen = await createScreen(org.ctx, { name: "TV", storeId: org.storeId });
      await expect(pairDevice(screen.pairingCode!, new Date(Date.now() + 16 * 60_000))).rejects.toMatchObject({ code: "not_found" });
      const fresh = await regeneratePairing(org.ctx, screen.id);
      expect(fresh.pairingCode).not.toBe(screen.pairingCode);
      await expect(pairDevice(screen.pairingCode!)).rejects.toMatchObject({ code: "not_found" });
      const ok = await pairDevice(fresh.pairingCode);
      expect(ok.token).toMatch(/^tvd_/);
    });

    it("limite de tentativas de pareamento (429)", async () => {
      for (let i = 0; i < 10; i++) {
        const r = await call(pairRoute.POST, req("POST", "/api/tv/pair", { body: { code: "AAAAAA" } }));
        expect(r.status).toBe(404);
      }
      const blocked = await call(pairRoute.POST, req("POST", "/api/tv/pair", { body: { code: "AAAAAA" } }));
      expect(blocked.status).toBe(429);
      expect(blocked.json.error.code).toBe("rate_limited");
    });

    it("plano sem o recurso TV recusa com mensagem clara", async () => {
      const org = await makeOrg({ plan: "inicial" });
      await expect(createScreen(org.ctx, { name: "TV", storeId: org.storeId })).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/TV|tv/) });
      const r = await call(screensRoute.POST, req("POST", "/api/tv/screens", { token: org.token, body: { name: "TV", storeId: org.storeId } }));
      expect(r.status).toBe(402);
      const list = await listScreens(org.ctx);
      expect(list.feature.included).toBe(false);
      expect(list.feature.message).toMatch(/não está incluído no plano/);
    });
  });

  describe("token do aparelho", () => {
    it("programação exige token; revogado ou trocado pelo link para de funcionar", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const { screen, token } = await pairedScreen(org);
      expect((await call(devicePlaylistRoute.GET, playlistReq(null))).status).toBe(401);
      expect((await call(devicePlaylistRoute.GET, playlistReq("tvd_inexistente"))).status).toBe(401);
      const ok = await call(devicePlaylistRoute.GET, playlistReq(token));
      expect(ok.status).toBe(200);
      const [seen] = await getDb().select().from(schema.tvScreens).where(eq(schema.tvScreens.id, screen.id));
      expect(seen!.lastSeenAt).toBeTruthy(); // heartbeat

      // link secreto: novo token substitui o anterior
      const link = await createScreenLink(org.ctx, screen.id);
      expect(link.path).toMatch(/^\/tv\/l\/tvd_/);
      const linkToken = link.path.split("/").pop()!;
      expect((await call(devicePlaylistRoute.GET, playlistReq(token))).status).toBe(401);
      expect((await call(devicePlaylistRoute.GET, playlistReq(linkToken))).status).toBe(200);

      const rv = await call(revokeRoute.POST, req("POST", `/api/tv/screens/${screen.id}/revoke`, { token: org.token }), { id: screen.id });
      expect(rv.status).toBe(200);
      const after = await call(devicePlaylistRoute.GET, playlistReq(linkToken));
      expect(after.status).toBe(401);
      expect(after.json.error.message).toMatch(/desconectada/);
    });

    it("ETag: sem mudança → 304; mudou a programação → nova versão", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const cid = await publishedCampaign(org);
      const { screen, token } = await pairedScreen(org);
      await savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cid }] });
      const a = await call(devicePlaylistRoute.GET, playlistReq(token));
      expect(a.status).toBe(200);
      const etag = a.res.headers.get("etag")!;
      expect(etag).toBe(`"${a.json.version}"`);
      expect(a.json.items).toHaveLength(1);
      expect(a.json.items[0].format).toBe("tv_horizontal");
      expect(a.json.items[0].pages).toBeGreaterThan(0);
      expect(JSON.stringify(a.json)).not.toMatch(/cost/i);
      expect((await call(devicePlaylistRoute.GET, playlistReq(token, etag))).status).toBe(304);
      await savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cid, durationSec: 20 }] });
      const c = await call(devicePlaylistRoute.GET, playlistReq(token, etag));
      expect(c.status).toBe(200);
      expect(c.json.items[0].slideSeconds).toBe(20);
    });

    it("tela vertical usa o formato story", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const cid = await publishedCampaign(org);
      const { screen, token } = await pairedScreen(org, { orientation: "vertical" });
      await savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cid }] });
      const r = await devicePlaylist(token, null);
      expect(r.body.items[0]).toMatchObject({ kind: "campaign", format: "story" });
    });
  });

  describe("agendamento", () => {
    it("regras puras no fuso de Brasília (dias, horas, virada da meia-noite)", () => {
      // 2026-10-12T02:30Z = domingo 11/10 23:30 em Brasília
      const t = new Date("2026-10-12T02:30:00Z");
      expect(spClock(t)).toEqual({ dow: 0, minutes: 23 * 60 + 30, ymd: "2026-10-11" });
      const base = { startsAt: null, endsAt: null, daysOfWeek: null, hours: null };
      expect(isScheduleActive({ ...base, daysOfWeek: [0] }, t)).toBe(true);
      expect(isScheduleActive({ ...base, daysOfWeek: [1] }, t)).toBe(false); // em UTC já seria segunda
      expect(isScheduleActive({ ...base, hours: "23:00-24:00" }, t)).toBe(true);
      expect(isScheduleActive({ ...base, hours: "08:00-12:00,14:00-18:00" }, t)).toBe(false);
      // faixa 22h–2h de sábado vale na madrugada de domingo
      const madrugada = new Date("2026-10-11T04:00:00Z"); // domingo 01:00
      expect(isScheduleActive({ ...base, daysOfWeek: [6], hours: "22:00-02:00" }, madrugada)).toBe(true);
      expect(isScheduleActive({ ...base, daysOfWeek: [0], hours: "22:00-02:00" }, madrugada)).toBe(false);
      // datas: dia inteiro em Brasília, fim exclusivo
      expect(spDateStart("2026-10-12").toISOString()).toBe("2026-10-12T03:00:00.000Z");
      expect(spDateEnd("2026-10-12").toISOString()).toBe("2026-10-13T03:00:00.000Z");
      const rule = { ...base, startsAt: spDateStart("2026-10-12").toISOString(), endsAt: spDateEnd("2026-10-12").toISOString() };
      expect(isScheduleActive(rule, new Date("2026-10-12T02:59:59Z"))).toBe(false);
      expect(isScheduleActive(rule, new Date("2026-10-12T03:00:00Z"))).toBe(true);
      expect(isScheduleActive(rule, new Date("2026-10-13T02:59:59Z"))).toBe(true);
      expect(isScheduleActive(rule, new Date("2026-10-13T03:00:00Z"))).toBe(false);
      expect(parseHours("8:00-12:00")).toBeNull();
      expect(parseHours("10:00-10:00")).toBeNull();
    });

    it("programação: datas, dias e horas decidem o que toca agora; período encerrado some", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const cid = await publishedCampaign(org);
      const { screen, token } = await pairedScreen(org);
      const now = tomorrowAt(10);
      const today = spYmd(now);
      const { dow } = spClock(now);
      const yesterday = spYmd(new Date(now.getTime() - 86400_000));
      const next = spYmd(new Date(now.getTime() + 86400_000));
      await savePlaylist(org.ctx, screen.id, {
        items: [
          { kind: "campaign", campaignId: cid, hours: "09:00-11:00" }, // agora
          { kind: "campaign", campaignId: cid, hours: "11:00-12:00" }, // mais tarde
          { kind: "campaign", campaignId: cid, daysOfWeek: [dow] }, // agora
          { kind: "campaign", campaignId: cid, daysOfWeek: [(dow + 1) % 7] }, // outro dia
          { kind: "campaign", campaignId: cid, startDate: today, endDate: today }, // agora
          { kind: "campaign", campaignId: cid, startDate: next }, // ainda não
          { kind: "campaign", campaignId: cid, endDate: yesterday }, // encerrado
        ],
      }, new Date());
      const r = await devicePlaylist(token, null, now);
      expect(r.body.items.map((i) => i.position)).toEqual([0, 2, 4]);
      expect(r.body.upcoming.map((i) => i.position)).toEqual([1, 3, 5]);
      // fronteira do fim do dia (Brasília): 23:59 toca, 00:00 do dia seguinte não
      const late = await devicePlaylist(token, null, tomorrowAt(23, 59));
      expect(late.body.items.map((i) => i.position)).toContain(4);
      const midnight = await devicePlaylist(token, null, tomorrowAt(24));
      expect([...midnight.body.items, ...midnight.body.upcoming].map((i) => i.position)).not.toContain(4);
      const detail = await getScreenDetail(org.ctx, screen.id, now);
      expect(detail.items[6]).toMatchObject({ state: "fora", reason: "Período da programação encerrado", endDate: yesterday });
      expect(detail.items[4]).toMatchObject({ state: "no_ar", startDate: today, endDate: today });
    });

    it("valida horário e datas", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const cid = await publishedCampaign(org);
      const screen = await createScreen(org.ctx, { name: "TV", storeId: org.storeId });
      await expect(savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cid, hours: "8h às 12h" }] })).rejects.toMatchObject({ code: "validation" });
      await expect(savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cid, startDate: "2026-10-12", endDate: "2026-10-10" }] })).rejects.toMatchObject({ code: "validation" });
    });
  });

  describe("validade das ofertas", () => {
    it("campanha vencida, não publicada ou voltada a rascunho nunca chega ao aparelho", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const live = await publishedCampaign(org, { name: "Ativa", end: days(2) });
      const future = await publishedCampaign(org, { name: "Futura", start: days(1), end: days(5) });
      const edited = await publishedCampaign(org, { name: "Editada" });
      const p = await makeProduct(org);
      const draft = await createCampaign(org.ctx, { storeId: org.storeId, name: "Rascunho", templateId: templateId(), startsAt: days(-1).toISOString(), endsAt: days(3).toISOString(), productIds: [p.id] });
      const { screen, token } = await pairedScreen(org);
      await savePlaylist(org.ctx, screen.id, { items: [live, future, edited].map((campaignId) => ({ kind: "campaign", campaignId })) });
      await expect(savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: draft.campaign.id }] })).rejects.toMatchObject({ code: "validation" });

      // editar o conteúdo de uma publicada a devolve a rascunho: sai da TV
      const st = await (await import("@/server/services/campaigns")).getEditorState(org.ctx, edited);
      await saveCampaign(org.ctx, edited, { baseVersion: st.campaign.version, items: st.items.map((i) => ({ ...i, offer: { ...i.offer, priceCents: 1990 } })) });

      const now = await devicePlaylist(token, null);
      expect(now.body.items.map((i) => i.kind === "campaign" && i.name)).toEqual(["Ativa"]);
      expect(now.body.upcoming.map((i) => i.kind === "campaign" && i.name)).toEqual(["Futura"]);
      expect(now.body.items[0]!.validUntil).toBeTruthy();

      // depois do fim da validade: nem em "agora" nem em "mais tarde"
      const later = await devicePlaylist(token, null, days(3));
      const names = [...later.body.items, ...later.body.upcoming].map((i) => i.kind === "campaign" && i.name);
      expect(names).not.toContain("Ativa");
      expect(names).toContain("Futura");
      const gone = await devicePlaylist(token, null, days(6));
      expect([...gone.body.items, ...gone.body.upcoming]).toHaveLength(0);

      // encerrar a campanha tira na hora
      await transitionCampaign(org.ctx, live, "end");
      const ended = await devicePlaylist(token, null);
      expect(ended.body.items).toHaveLength(0);
    });

    it("vídeo concluído: URL assinada pela tela, com Range; vídeo de versão antiga não toca", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const cid = await publishedCampaign(org);
      const [camp] = await getDb().select().from(schema.campaigns).where(eq(schema.campaigns.id, cid));
      const assetId = `ast_tv${uid()}`;
      const key = `${org.orgId}/videos/${assetId}.mp4`;
      const bytes = Buffer.from("0123456789abcdefghij");
      await storage.put(key, bytes, "video/mp4");
      await getDb().insert(schema.assets).values({ id: assetId, orgId: org.orgId, kind: "video", storageKey: key, mime: "video/mp4", bytes: bytes.length, source: "gerado_sistema" });
      const jobId = `vid_${uid()}`;
      const oldJob = `vid_${uid()}`;
      await getDb().insert(schema.videoJobs).values([
        { id: jobId, orgId: org.orgId, campaignId: cid, campaignVersion: camp!.publishedVersion!, orientation: "horizontal", durationSec: 15, status: "concluida", outputAssetId: assetId },
        { id: oldJob, orgId: org.orgId, campaignId: cid, campaignVersion: camp!.publishedVersion! - 1, orientation: "horizontal", durationSec: 15, status: "concluida", outputAssetId: assetId },
      ]);
      const { screen, token } = await pairedScreen(org);
      const detail = await getScreenDetail(org.ctx, screen.id);
      expect(detail.candidates.videos.map((v) => v.id)).toContain(jobId);
      await savePlaylist(org.ctx, screen.id, { items: [{ kind: "video", videoJobId: jobId }, { kind: "video", videoJobId: oldJob }] });
      const pl = await devicePlaylist(token, null);
      expect(pl.body.items).toHaveLength(1);
      const v = pl.body.items[0]!;
      expect(v.kind).toBe("video");
      if (v.kind !== "video") return;
      const url = new URL(v.url, "http://localhost");
      const full = await call(mediaRoute.GET, req("GET", v.url), { assetId });
      expect(full.status).toBe(200);
      expect(full.res.headers.get("content-type")).toBe("video/mp4");
      const part = await call(mediaRoute.GET, req("GET", v.url, { headers: { range: "bytes=2-5" } }), { assetId });
      expect(part.status).toBe(206);
      expect(await part.res.text()).toBe("2345");
      expect(part.res.headers.get("content-range")).toBe("bytes 2-5/20");
      // sem token ou com tela desconectada: recusado
      expect((await call(mediaRoute.GET, req("GET", url.pathname), { assetId })).status).toBe(401);
      await revokeScreen(org.ctx, screen.id);
      expect((await call(mediaRoute.GET, req("GET", v.url), { assetId })).status).toBe(401);
      const d2 = await getScreenDetail(org.ctx, screen.id);
      expect(d2.items[1]!.reason).toMatch(/versão antiga/);
    });
  });

  describe("isolamento e permissões", () => {
    it("aparelho da conta B não recebe conteúdo da conta A; B não usa campanha nem tela de A", async () => {
      const a = await makeOrg({ plan: "profissional" });
      const b = await makeOrg({ plan: "profissional" });
      const ca = await publishedCampaign(a, { name: "Ofertas A" });
      const { screen: sa } = await pairedScreen(a);
      await savePlaylist(a.ctx, sa.id, { items: [{ kind: "campaign", campaignId: ca }] });
      const { screen: sb, token: tb } = await pairedScreen(b);
      await expect(savePlaylist(b.ctx, sb.id, { items: [{ kind: "campaign", campaignId: ca }] })).rejects.toMatchObject({ code: "validation" });
      // mesmo inserindo direto no banco, a montagem filtra pela conta do aparelho
      await getDb().insert(schema.tvPlaylistItems).values({ id: `tvi_x${uid()}`, orgId: b.orgId, screenId: sb.id, kind: "campaign", campaignId: ca, position: 0 });
      const r = await devicePlaylist(tb, null);
      expect(r.body.items).toHaveLength(0);
      expect(JSON.stringify(r.body)).not.toContain("Ofertas A");
      // gestão: B não vê nem altera a tela de A
      await expect(getScreenDetail(b.ctx, sa.id)).rejects.toMatchObject({ code: "not_found" });
      const g = await call(screenRoute.GET, req("GET", `/api/tv/screens/${sa.id}`, { token: b.token }), { id: sa.id });
      expect(g.status).toBe(404);
      const rv = await call(revokeRoute.POST, req("POST", `/api/tv/screens/${sa.id}/revoke`, { token: b.token }), { id: sa.id });
      expect(rv.status).toBe(404);
      expect((await listScreens(b.ctx)).screens.map((s) => s.id)).not.toContain(sa.id);
    });

    it("campanha de outra loja da mesma conta é recusada", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const other = await createStore(org.ctx, { name: `Filial ${uid()}` });
      const cOther = await publishedCampaign(org, { storeId: (other as { id: string }).id });
      const screen = await createScreen(org.ctx, { name: "TV", storeId: org.storeId });
      await expect(savePlaylist(org.ctx, screen.id, { items: [{ kind: "campaign", campaignId: cOther }] })).rejects.toMatchObject({ message: expect.stringMatching(/outra loja/) });
    });

    it("leitura para todos os papéis; escrita exige campaigns.write; membro restrito só vê suas lojas", async () => {
      const org = await makeOrg({ plan: "profissional" });
      const screen = await createScreen(org.ctx, { name: "TV", storeId: org.storeId });
      const approver = await addMember(org, "aprovador");
      const list = await call(screensRoute.GET, req("GET", "/api/tv/screens", { token: approver.token }));
      expect(list.status).toBe(200);
      expect(list.json.screens[0].pairingCode).toBeNull(); // código só para quem pode editar
      expect(list.json.canWrite).toBe(false);
      const post = await call(screensRoute.POST, req("POST", "/api/tv/screens", { token: approver.token, body: { name: "X", storeId: org.storeId } }));
      expect(post.status).toBe(403);
      const put = await call(playlistRoute.PUT, req("PUT", `/api/tv/screens/${screen.id}/playlist`, { token: approver.token, body: { items: [] } }), { id: screen.id });
      expect(put.status).toBe(403);
      const del = await call(screenRoute.DELETE, req("DELETE", `/api/tv/screens/${screen.id}`, { token: approver.token }), { id: screen.id });
      expect(del.status).toBe(403);

      const editor = await addMember(org, "editor");
      const ok = await call(playlistRoute.PUT, req("PUT", `/api/tv/screens/${screen.id}/playlist`, { token: editor.token, body: { items: [] } }), { id: screen.id });
      expect(ok.status).toBe(200);
      const created = await call(screensRoute.POST, req("POST", "/api/tv/screens", { token: editor.token, body: { name: "TV açougue", storeId: org.storeId, slideSeconds: 8 } }));
      expect(created.status).toBe(200);
      expect(created.json.screen.pairingCode).toMatch(/^[A-Z0-9]{6}$/);

      const restricted = await addMember(org, "editor", ["sto_outra"]);
      const rl = await call(screensRoute.GET, req("GET", "/api/tv/screens", { token: restricted.token }));
      expect(rl.json.screens).toHaveLength(0);
      const rg = await call(screenRoute.GET, req("GET", `/api/tv/screens/${screen.id}`, { token: restricted.token }), { id: screen.id });
      expect(rg.status).toBe(404);
      const rc = await call(screensRoute.POST, req("POST", "/api/tv/screens", { token: restricted.token, body: { name: "X", storeId: org.storeId } }));
      expect(rc.status).toBe(403);
    });
  });
});
