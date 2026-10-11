// Ícones da interface (SVG inline, traço 2 px, 24×24, cor = currentColor).
// Decorativos por padrão (aria-hidden); passe `title` quando o ícone for o único rótulo.
import type { ReactNode, SVGProps } from "react";

export type IconProps = { size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, "children">;

function make(name: string, body: ReactNode) {
  function Icon({ size = 20, title, ...rest }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        role={title ? "img" : undefined} aria-hidden={title ? undefined : true} focusable="false" {...rest}>
        {title && <title>{title}</title>}
        {body}
      </svg>
    );
  }
  Icon.displayName = `Icon${name}`;
  return Icon;
}

export const IconPlus = make("Plus", <path d="M12 5v14M5 12h14" />);
export const IconClose = make("Close", <path d="M6 6l12 12M18 6 6 18" />);
export const IconCheck = make("Check", <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconChevronRight = make("ChevronRight", <path d="m9 6 6 6-6 6" />);
export const IconChevronLeft = make("ChevronLeft", <path d="m15 6-6 6 6 6" />);
export const IconChevronDown = make("ChevronDown", <path d="m6 9 6 6 6-6" />);
export const IconSearch = make("Search", <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>);
export const IconEdit = make("Edit", <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>);
export const IconTrash = make("Trash", <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const IconCopy = make("Copy", <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const IconDownload = make("Download", <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconUpload = make("Upload", <><path d="M12 16V5M7 10l5-5 5 5" /><path d="M5 20h14" /></>);
export const IconImage = make("Image", <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5.2-5 3.6 3.4 2.6-2.4L20 18" /></>);
export const IconTag = make("Tag", <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9Z" /><circle cx="8" cy="8" r="1.6" /></>);
export const IconPercent = make("Percent", <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /></>);
export const IconFlyer = make("Flyer", <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
export const IconCalendar = make("Calendar", <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconClock = make("Clock", <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconStore = make("Store", <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5 11.5V20h14v-8.5M10 20v-5h4v5" /></>);
export const IconUsers = make("Users", <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.8a3.2 3.2 0 0 1 0 6.4M21 20a6 6 0 0 0-3.5-5.5" /></>);
export const IconSettings = make("Settings", <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" /><circle cx="12" cy="12" r="7" /></>);
export const IconShare = make("Share", <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>);
export const IconEye = make("Eye", <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>);
export const IconEyeOff = make("EyeOff", <><path d="M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1" /><path d="M9.9 10a2.8 2.8 0 0 0 4 4" /></>);
export const IconAlert = make("Alert", <><path d="M12 3.5 2.8 19.5h18.4Z" /><path d="M12 10v4.2M12 17.2h.01" /></>);
export const IconInfo = make("Info", <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>);
export const IconHome = make("Home", <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></>);
export const IconMenu = make("Menu", <path d="M4 7h16M4 12h16M4 17h16" />);
export const IconLogout = make("Logout", <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>);
export const IconPhone = make("Phone", <path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />);
export const IconChat = make("Chat", <path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5Z" />);
export const IconPin = make("Pin", <><path d="M12 21.5s6.5-5.8 6.5-11.2a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11.2 6.5 11.2Z" /><circle cx="12" cy="10.3" r="2.3" /></>);
export const IconPrinter = make("Printer", <><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7Z" /></>);
export const IconTv = make("Tv", <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>);
export const IconPhoneScreen = make("PhoneScreen", <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>);
export const IconSparkle = make("Sparkle", <path d="M12 3.5 13.8 10 20.5 12l-6.7 2-1.8 6.5-1.8-6.5L3.5 12l6.7-2Z" />);
export const IconUndo = make("Undo", <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>);
export const IconRedo = make("Redo", <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>);
export const IconGrid = make("Grid", <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>);
export const IconList = make("List", <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
export const IconDrag = make("Drag", <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" strokeWidth={3} />);
export const IconQr = make("Qr", <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v6h-6M17 17h.01" /></>);
