import { tenantRoute } from "@/server/http";
import { revokeScreen } from "@/server/services/tv";

/** Desconecta o aparelho/link da tela: ele para na próxima sincronização. */
export const POST = tenantRoute(async (_req, ctx, p) => revokeScreen(ctx, p.id!), { permission: "campaigns.write" });
