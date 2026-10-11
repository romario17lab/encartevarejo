"use client";
// Pontos de entrada do vídeo no editor: um botão (menu "Ações") e o diálogo montado uma vez.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { VideoDialog } from "./VideoDialog";

const OPEN_EVENT = "ev:open-video";

export function VideoMenuButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <Button variant="secondary" onClick={() => { onOpen?.(); window.dispatchEvent(new Event(OPEN_EVENT)); }}
      icon={<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="5.5" width="13" height="13" rx="2.5" /><path d="m16 10 5-3v10l-5-3z" /></svg>}>
      Vídeo de ofertas (MP4)
    </Button>
  );
}

export function VideoMount({ campaignId, beforeCreate }: { campaignId: string; beforeCreate?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  return <VideoDialog open={open} onClose={() => setOpen(false)} campaignId={campaignId} beforeCreate={beforeCreate} />;
}
