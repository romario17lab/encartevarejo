import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
export type IdPrefix = "usr" | "org" | "ses" | "inv" | "brk" | "sto" | "ast" | "prd" | "cmp" | "itm" | "exp" | "cal" | "rst";
export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`;
