// Narração por síntese de voz (TTS). Interface de provedor + implementações:
//  - "none": sem narração;
//  - "google": Google Cloud Text-to-Speech, API REST v1 (text:synthesize) com chave de API.
//    Variáveis: GOOGLE_TTS_API_KEY (obrigatória), GOOGLE_TTS_VOICE (padrão pt-BR-Neural2-A),
//    GOOGLE_TTS_ENDPOINT (opcional; padrão https://texttospeech.googleapis.com/v1/text:synthesize).
// Sem credenciais o provedor aparece como "não configurado" na interface.
// OBS.: o cliente REST segue a documentação pública da API; ele é testado aqui contra um servidor
// simulado, não contra o serviço real do Google.
import type { TtsProviderId } from "@/render/video/options";

export interface TtsProvider {
  id: TtsProviderId;
  label: string;
  configured(): boolean;
  defaultVoice(): string | null;
  /** MP3 com a fala do texto */
  synthesize(text: string, opts?: { voice?: string | null; signal?: AbortSignal }): Promise<Buffer>;
}

export class TtsError extends Error {
  constructor(public readonly userMessage: string, public readonly retryable: boolean, technical?: string) { super(technical ?? userMessage); }
}

const noneProvider: TtsProvider = {
  id: "none", label: "Sem narração",
  configured: () => true,
  defaultVoice: () => null,
  async synthesize() { throw new TtsError("Narração desativada.", false); },
};

const googleProvider: TtsProvider = {
  id: "google", label: "Google Cloud Text-to-Speech",
  configured: () => !!process.env.GOOGLE_TTS_API_KEY?.trim(),
  defaultVoice: () => process.env.GOOGLE_TTS_VOICE?.trim() || "pt-BR-Neural2-A",
  async synthesize(text, opts = {}) {
    const key = process.env.GOOGLE_TTS_API_KEY?.trim();
    if (!key) throw new TtsError("O serviço de narração não está configurado.", false);
    const endpoint = process.env.GOOGLE_TTS_ENDPOINT?.trim() || "https://texttospeech.googleapis.com/v1/text:synthesize";
    const voice = opts.voice?.trim() || googleProvider.defaultVoice()!;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", "x-goog-api-key": key },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "pt-BR", name: voice },
          audioConfig: { audioEncoding: "MP3", sampleRateHertz: 48000, speakingRate: 1.05 },
        }),
        signal: opts.signal ?? AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new TtsError("O serviço de narração não respondeu. Tente novamente em alguns minutos.", true, `tts fetch: ${(e as Error).message}`);
    }
    const body = await res.text();
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new TtsError(retryable ? "O serviço de narração está instável. Tente novamente em alguns minutos." : "O serviço de narração recusou o pedido. Confira a chave e a voz configuradas.", retryable, `tts HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    let audio: string | undefined;
    try { audio = (JSON.parse(body) as { audioContent?: string }).audioContent; } catch { /* abaixo */ }
    if (!audio) throw new TtsError("O serviço de narração devolveu uma resposta inválida.", true, "tts sem audioContent");
    return Buffer.from(audio, "base64");
  },
};

const PROVIDERS: Record<TtsProviderId, TtsProvider> = { none: noneProvider, google: googleProvider };

export function getTtsProvider(id: TtsProviderId): TtsProvider {
  return PROVIDERS[id] ?? noneProvider;
}

/** Provedor de narração da instalação (VIDEO_TTS_PROVIDER; padrão: google quando há chave). */
export function activeTtsProvider(): TtsProvider {
  const wanted = (process.env.VIDEO_TTS_PROVIDER?.trim() || (process.env.GOOGLE_TTS_API_KEY ? "google" : "none")) as TtsProviderId;
  return PROVIDERS[wanted] ?? noneProvider;
}

export function ttsStatus() {
  const p = activeTtsProvider();
  const google = getTtsProvider("google");
  return {
    provider: p.id === "none" ? "google" as const : p.id,
    label: google.label,
    configured: p.id !== "none" && p.configured(),
    voice: p.id !== "none" ? p.defaultVoice() : null,
  };
}
