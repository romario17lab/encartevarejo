import Image from "next/image";
import { EXAMPLES, type ExampleId } from "./examples";

/** Exemplo real (gerado pelo produto) com legenda obrigatória "Exemplo com dados de demonstração". */
export function ExampleFigure({ id, sizes, className, priority = false, caption }: {
  id: ExampleId;
  /** atributo sizes do next/image (largura exibida) */
  sizes: string;
  className?: string;
  priority?: boolean;
  /** texto extra depois do nome da peça */
  caption?: string;
}) {
  const e = EXAMPLES[id];
  return (
    <figure className={["m-0 flex flex-col", className].filter(Boolean).join(" ")}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <Image src={e.src} width={e.width} height={e.height} alt={e.alt} sizes={sizes} priority={priority} className="block h-auto w-full" />
      </div>
      <figcaption className="mt-2 text-sm leading-snug text-ink-muted">
        <span className="font-semibold text-ink">{e.label}.</span>{caption ? ` ${caption}` : ""}{" "}
        <span className="mt-1 inline-block rounded-md bg-highlight/60 px-1.5 py-0.5 text-xs font-bold text-ink">Exemplo com dados de demonstração</span>
      </figcaption>
    </figure>
  );
}
