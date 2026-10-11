import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
export const metadata: Metadata = { title: "Criar conta" };
export default function Page() { return <SignupForm />; }
