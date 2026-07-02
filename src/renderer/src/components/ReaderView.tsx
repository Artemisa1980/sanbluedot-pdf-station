import { useEffect, useRef, useState } from "react";
import { useStation } from "../state/store";
import { effectiveBackground, sourceFor } from "../engine/sources";
import { getPageSizePt, renderPageDataUrl } from "../engine/thumbnails";
import { Thumbnail } from "./Thumbnail";
import type { PageRef } from "../../../shared/types";

const BASE_W = 800; // ancho de página a zoom 100%
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

/**
 * Vista lectura estilo Adobe: todas las páginas apiladas como hojas con scroll
 * continuo, carril de miniaturas sincronizado y barra flotante de zoom/navegación.
 * Render perezoso: cada hoja se dibuja solo cuando se acerca al viewport.
 */
export function ReaderView({ initialId, onClose }: { initialId: string; onClose: () => void }) {
  const { project, dispatch } = useStation();
  const pages = project.pages;

  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(() => Math.max(0, pages.findIndex((p) => p.id === initialId)));
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const spyLock = useRef(false); // evita que el salto programático dispare el scroll-spy

  const width = Math.round(BASE_W * zoom);

  // Si la página vista desaparece (eliminada), ajustar índice; sin páginas → volver a la grilla
  useEffect(() => {
    if (pages.length === 0) onClose();
    else if (current >= pages.length) setCurrent(pages.length - 1);
  }, [pages.length, current, onClose]);

  // Al montar: saltar a la página inicial
  useEffect(() => {
    const idx = Math.max(0, pages.findIndex((p) => p.id === initialId));
    requestAnimationFrame(() => jumpTo(idx, "auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc vuelve a la grilla
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll-spy: la página cuyo centro cruza el centro del viewport es la actual
  function onScroll() {
    if (spyLock.current) return;
    const root = scrollRef.current;
    if (!root) return;
    const mid = root.scrollTop + root.clientHeight / 2;
    let best = 0;
    for (let i = 0; i < pages.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      if (el.offsetTop <= mid) best = i;
      else break;
    }
    if (best !== current) setCurrent(best);
  }

  // El carril sigue a la página actual
  useEffect(() => {
    railRefs.current[current]?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function jumpTo(idx: number, behavior: ScrollBehavior = "smooth") {
    const el = pageRefs.current[idx];
    const root = scrollRef.current;
    if (!el || !root) return;
    spyLock.current = true;
    root.scrollTo({ top: el.offsetTop - 24, behavior });
    setCurrent(idx);
    dispatch({ type: "select", ids: [pages[idx].id] });
    window.setTimeout(() => (spyLock.current = false), behavior === "smooth" ? 450 : 50);
  }

  function fitWidth() {
    const root = scrollRef.current;
    if (!root) return;
    setZoom(clampZoom((root.clientWidth - 56) / BASE_W));
  }

  function fitPage() {
    const root = scrollRef.current;
    if (!root) return;
    // Ajusta la altura de la página actual al viewport (ratio real ya medido si está renderizada)
    const el = pageRefs.current[current];
    const ratio = el ? el.offsetHeight / el.offsetWidth : 792 / 612;
    setZoom(clampZoom((root.clientHeight - 56) / (BASE_W * ratio)));
  }

  const total = pages.length;

  return (
    <div className="flex min-h-0 flex-1" style={{ background: "var(--panel-header)" }}>
      {/* Carril de miniaturas sincronizado */}
      <div
        className="flex w-[124px] shrink-0 flex-col gap-2 overflow-auto border-r p-2"
        style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}
      >
        {pages.map((p, i) => {
          const src = sourceFor(project, p);
          if (!src) return null;
          return (
            <button
              key={p.id}
              ref={(el) => {
                railRefs.current[i] = el;
              }}
              className="rounded-md border-2 p-0.5"
              style={{ borderColor: i === current ? "var(--accent)" : "transparent" }}
              onClick={() => jumpTo(i)}
              title={`Página ${i + 1}`}
            >
              <Thumbnail
                srcId={p.srcId}
                bytes={src.bytes}
                pageIndex={p.pageIndex}
                rotation={p.rotation}
                background={effectiveBackground(project, p)}
                width={104}
              />
              <div className="text-[9px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
                {i + 1}
              </div>
            </button>
          );
        })}
      </div>

      {/* Hojas con scroll continuo */}
      <div className="relative min-w-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-auto px-7 py-6" onScroll={onScroll}>
          <div className="mx-auto flex w-fit flex-col gap-6">
            {pages.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
              >
                <ReaderPage page={p} width={width} scrollRoot={scrollRef} />
                <div
                  className="mt-1 text-center text-[10px]"
                  style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}
                >
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Barra flotante: navegación + zoom */}
        <div className="float-bar card-retro">
          <span className="text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--text-label)" }}>
            {total === 0 ? "—" : `${current + 1}/${total}`}
          </span>
          <button className="btn-ghost" title="Página anterior" disabled={current <= 0} onClick={() => jumpTo(current - 1)}>
            ∧
          </button>
          <button
            className="btn-ghost"
            title="Página siguiente"
            disabled={current >= total - 1}
            onClick={() => jumpTo(current + 1)}
          >
            ∨
          </button>
          <div className="my-1 h-px w-6" style={{ background: "var(--border)" }} />
          <button className="btn-ghost" title="Acercar" onClick={() => setZoom((z) => clampZoom(z * 1.2))}>
            ＋
          </button>
          <span className="text-[9px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="btn-ghost" title="Alejar" onClick={() => setZoom((z) => clampZoom(z / 1.2))}>
            −
          </button>
          <div className="my-1 h-px w-6" style={{ background: "var(--border)" }} />
          <button className="btn-ghost" title="Ajustar al ancho" onClick={fitWidth}>
            ⤢
          </button>
          <button className="btn-ghost" title="Página completa" onClick={fitPage}>
            ▭
          </button>
        </div>
      </div>
    </div>
  );
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Una hoja: dimensiones reales de la página, render perezoso al acercarse al viewport. */
function ReaderPage({
  page,
  width,
  scrollRoot
}: {
  page: PageRef;
  width: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
}) {
  const { project } = useStation();
  const src = sourceFor(project, page);
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(792 / 612); // alto/ancho del PDF sin rotar (Letter por defecto)
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const bytes = src?.bytes ?? null;
  const rotated = page.rotation === 90 || page.rotation === 270;
  const background = effectiveBackground(project, page);

  // Dimensiones reales de la página (en puntos) para reservar el espacio exacto
  useEffect(() => {
    let alive = true;
    if (!bytes) return;
    getPageSizePt(page.srcId, bytes, page.pageIndex)
      .then((s) => alive && setRatio(s.height / s.width))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [page.srcId, page.pageIndex, bytes]);

  // Lazy: renderizar solo cuando la hoja se acerca al viewport (±900px)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { root: scrollRoot.current, rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!near || !bytes) return;
    let alive = true;
    // Con fondo: render transparente, el color va debajo — idéntico a la exportación
    renderPageDataUrl(
      page.srcId,
      bytes,
      page.pageIndex,
      rotated ? Math.round(width / ratio) : width,
      background !== null
    )
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, bytes, page.srcId, page.pageIndex, width, ratio, page.rotation, background]);

  const h = Math.round(rotated ? width / ratio : width * ratio);
  const imgW = rotated ? h : width;
  const imgH = rotated ? width : h;

  return (
    <div
      ref={ref}
      className="sheet relative overflow-hidden"
      style={{ width, height: h, background: background ?? "#ffffff" }}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute top-1/2 left-1/2"
          style={{
            width: imgW,
            height: imgH,
            transform: `translate(-50%,-50%) rotate(${page.rotation}deg)`
          }}
        />
      )}
    </div>
  );
}
