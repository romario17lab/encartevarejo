// Ícones de traço simples usados na navegação do app (decorativos: aria-hidden).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 22, ...rest }: P) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...rest,
});

export const IconHome = (p: P) => <svg {...base(p)}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
export const IconMegaphone = (p: P) => <svg {...base(p)}><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 8a5 5 0 0 1 0 8" /></svg>;
export const IconBox = (p: P) => <svg {...base(p)}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>;
export const IconStore = (p: P) => <svg {...base(p)}><path d="M4 9l1-5h14l1 5" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5 11v9h14v-9" /><path d="M10 20v-5h4v5" /></svg>;
export const IconMenu = (p: P) => <svg {...base(p)}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>;
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>;
export const IconTag = (p: P) => <svg {...base(p)}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>;
export const IconUpload = (p: P) => <svg {...base(p)}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>;
export const IconSearch = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
export const IconImage = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>;
export const IconLogout = (p: P) => <svg {...base(p)}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>;
export const IconUndo = (p: P) => <svg {...base(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
export const IconRedo = (p: P) => <svg {...base(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>;
export const IconUp = (p: P) => <svg {...base(p)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
export const IconDown = (p: P) => <svg {...base(p)}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>;
export const IconStar = (p: P) => <svg {...base(p)}><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z" /></svg>;
export const IconPause = (p: P) => <svg {...base(p)}><path d="M9 5v14M15 5v14" /></svg>;
export const IconHistory = (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></svg>;
export const IconDownload = (p: P) => <svg {...base(p)}><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>;
export const IconAlert = (p: P) => <svg {...base(p)}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>;
export const IconBack = (p: P) => <svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconGrip = (p: P) => <svg {...base(p)}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>;
export const IconSettings = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
export const IconShare = (p: P) => <svg {...base(p)}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>;
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const IconChart = (p: P) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const IconSparkle = (p: P) => <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>;
export const IconTv = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
export const IconBriefcase = (p: P) => <svg {...base(p)}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></svg>;
export const IconPlug = (p: P) => <svg {...base(p)}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></svg>;
