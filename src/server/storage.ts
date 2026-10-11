import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Armazenamento de arquivos. Implementação local (pasta STORAGE_DIR).
 * Em produção, troque por um adaptador S3 compatível mantendo esta interface.
 * As chaves sempre começam com o orgId: "{orgId}/images/{id}.webp", "{orgId}/exports/{id}.zip".
 * Nada aqui é público: o acesso passa por /api/assets/:id (sessão) ou URL assinada.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function root() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

function safePath(key: string) {
  if (!/^[a-zA-Z0-9_\-./]+$/.test(key) || key.includes("..")) throw new Error("Chave de armazenamento inválida");
  return path.join(root(), key);
}

export const localStorage: Storage = {
  async put(key, data) {
    const p = safePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  },
  async get(key) { return readFile(safePath(key)); },
  async delete(key) { await rm(safePath(key), { force: true }); },
  async exists(key) { try { await stat(safePath(key)); return true; } catch { return false; } },
};

export const storage: Storage = localStorage;
