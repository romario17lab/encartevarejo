import { AppError } from "../errors";
import { aiConfig } from "./config";
import { AiNotConfiguredError, ProviderHttpError, providerError, sendWithRetry } from "./http";

// Remoção de fundo por um provedor externo real. Só recorta a foto enviada pelo lojista:
// nunca gera, completa ou substitui a embalagem. O resultado vira um arquivo NOVO (a original fica intacta).

export interface BackgroundRemover {
  /** identificação gravada em ai_requests.provider e na origem do arquivo */
  readonly name: string;
  isConfigured(): boolean;
  /** Devolve PNG com transparência. */
  remove(image: Buffer, mime: string): Promise<Buffer>;
}

const SERVICE = "A remoção de fundo";

/** remove.bg (REST, multipart). Chave em REMOVEBG_API_KEY; URL opcional em REMOVEBG_URL. */
export const removeBgProvider: BackgroundRemover = {
  name: "remove.bg",
  isConfigured: () => !!aiConfig().removeBgKey,
  async remove(image, mime) {
    const cfg = aiConfig();
    if (!cfg.removeBgKey) throw new AiNotConfiguredError("A remoção de fundo");
    const key = cfg.removeBgKey;
    const build = () => {
      const form = new FormData();
      form.append("image_file", new Blob([new Uint8Array(image)], { type: mime }), mime === "image/png" ? "foto.png" : mime === "image/webp" ? "foto.webp" : "foto.jpg");
      form.append("size", "auto");
      form.append("format", "png");
      return { method: "POST", headers: { "X-Api-Key": key, accept: "image/png" }, body: form } satisfies RequestInit;
    };
    let res: Response;
    try {
      res = await sendWithRetry(cfg.removeBgUrl, build, { service: SERVICE, timeoutMs: Math.min(cfg.timeoutMs, 60_000), maxRetries: cfg.maxRetries, retryBaseMs: cfg.retryBaseMs });
    } catch (e) {
      if (e instanceof ProviderHttpError) {
        // 400 do remove.bg = imagem sem objeto reconhecível em primeiro plano
        if (e.status === 400) throw new AppError("validation", "Não foi possível separar o produto do fundo nesta foto. Tente uma foto com o produto mais visível.");
        throw providerError(SERVICE, e.status);
      }
      throw e;
    }
    const out = Buffer.from(await res.arrayBuffer());
    if (!out.length) throw new AppError("external_service", "A remoção de fundo devolveu um arquivo vazio. Tente de novo.");
    return out;
  },
};

let current: BackgroundRemover = removeBgProvider;

export function backgroundRemover(): BackgroundRemover { return current; }

/** Só para testes ou para trocar de provedor: define o provedor de remoção de fundo. */
export function setBackgroundRemover(p: BackgroundRemover | null) { current = p ?? removeBgProvider; }
