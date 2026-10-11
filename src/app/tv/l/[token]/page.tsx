import { TvLinkBoot } from "@/components/tv/TvLinkBoot";

/** Player por link secreto (telas sem teclado): guarda o token no aparelho e abre o player. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TvLinkBoot token={token} />;
}
