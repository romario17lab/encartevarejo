import bcrypt from "bcryptjs";

const COST = 12;
export const PASSWORD_MIN = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try { return await bcrypt.compare(password, hash); } catch { return false; }
}

// hash fixo usado para gastar o mesmo tempo quando o e-mail não existe (evita descobrir contas pelo tempo de resposta)
let dummyHash: string | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("senha-inexistente-para-tempo-constante", COST);
  await bcrypt.compare(password, dummyHash);
}
