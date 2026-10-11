"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { can, type Permission } from "@/domain/campaign";
import { ApiError, request, type Me } from "./api";

export interface Query<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (fn: T | ((prev: T | undefined) => T)) => void;
}

/** Busca simples com estado de carregamento/erro e recarga. `path` null = não busca. */
export function useApi<T>(path: string | null, deps: unknown[] = []): Query<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await request<T>(path);
      if (my === seq.current) setDataState(d);
    } catch (e) {
      if (my === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, "unknown", "Não foi possível carregar."));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { void load(); }, [load]);
  const setData = useCallback((fn: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof fn === "function" ? (fn as (p: T | undefined) => T)(prev) : fn));
  }, []);
  return { data, error, loading, reload: load, setData };
}

// ---------------- Usuário logado ----------------
export interface MeCtx {
  me: Me;
  reload: () => Promise<void>;
  can: (p: Permission) => boolean;
  storeId: string | null;
  setStoreId: (id: string) => void;
}
export const MeContext = createContext<MeCtx | null>(null);
export function useMe(): MeCtx {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe fora do AppShell");
  return v;
}
export const hasPermission = (me: Me, p: Permission) => (me.permissions?.length ? me.permissions.includes(p) : can(me.role, p));

/** Valor com atraso (busca enquanto digita). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function safeStorage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
