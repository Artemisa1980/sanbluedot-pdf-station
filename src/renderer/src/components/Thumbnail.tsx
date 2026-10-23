import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { bytesSignature } from "../engine/bytesCache";
import { renderPageDataUrl } from "../engine/thumbnails";
import type { Rotation } from "../../../shared/types";

interface Props {
  srcId: string;
  bytes: Uint8Array;
  pageIndex: number;
  rotation?: Rotation;
  background?: string | null;
  /** Teñir la hoja: el color va encima en modo multiplicar (igual que la exportación) */
  tint?: boolean;
  width?: number;
  /** Renderiza solo cuando la miniatura se acerca al viewport (listas largas: selector, carril) */
  lazy?: boolean;
}

export function Thumbnail({ srcId, bytes, pageIndex, rotation = 0, background = null, tint = false, width = 180, lazy = false }: Props) {
  // La imagen viaja con la identidad de la página que la produjo: si la página cambia,
  // la imagen vieja no se queda pegada mientras llega la nueva
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(!lazy);
  const boxRef = useRef<HTMLDivElement>(null);
  const sideways = rotation === 90 || rotation === 270;
  const tinted = tint && background !== null;
  // El contenido (bytes recompilados), el fondo y el tinte también son identidad: un render
  // nuevo que falla nunca deja a la vista la imagen del contenido anterior
  const key = `${srcId}:${bytesSignature(bytes)}:${pageIndex}:${width}:${background}:${tinted}:${attempt}`;
  const url = shown && shown.key === key ? shown.url : null;
  const failed = failedKey === key;

  // Lazy: se monta (y queda montada) la primera vez que se acerca al viewport
  useEffect(() => {
    if (visible) return;
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setFailedKey(null); // un intento nuevo (otros bytes, reintento) parte sin error
    // Con fondo: render transparente y color debajo — idéntico a la capa de la exportación.
    // Teñida: render normal (hoja blanca) y el color encima en modo multiplicar.
    renderPageDataUrl(srcId, bytes, pageIndex, width, background !== null && !tinted)
      .then((u) => alive && setShown({ key, url: u }))
      .catch(() => alive && setFailedKey(key));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcId, bytes, pageIndex, width, background, tinted, attempt, visible]);

  function retry(e: SyntheticEvent) {
    e.stopPropagation();
    e.preventDefault();
    setFailedKey(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div
      ref={boxRef}
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{
        aspectRatio: "17 / 22", // proporción Letter — contenedor estable mientras carga
        backgroundColor: tinted ? "#ffffff" : (background ?? "#ffffff"),
        borderRadius: "4px",
        isolation: "isolate"
      }}
    >
      {url ? (
        <img
          src={url}
          alt={`Página ${pageIndex + 1}`}
          className={sideways ? undefined : "max-h-full max-w-full"}
          style={{
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            // Girada 90°/270° la imagen ocupa su alto como ancho: se limita con las medidas
            // cruzadas del recuadro 17:22 para que no se recorte por los lados
            ...(sideways ? { maxWidth: `${(22 / 17) * 100}%`, maxHeight: `${(17 / 22) * 100}%` } : {})
          }}
          draggable={false}
        />
      ) : failed ? (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center"
          style={{ background: "var(--input-bg)", color: "var(--danger)" }}
          role="alert"
        >
          <span className="text-[10px]" style={{ fontFamily: "var(--mono)" }}>
            No se pudo mostrar
          </span>
          <span
            role="button"
            tabIndex={0}
            className="btn-ghost"
            aria-label={`Reintentar la miniatura de la página ${pageIndex + 1}`}
            onClick={retry}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") retry(e);
            }}
          >
            Reintentar
          </span>
        </div>
      ) : (
        <div className="h-full w-full animate-pulse" style={{ background: "var(--input-bg)" }} />
      )}
      {tinted && url && (
        <div className="pointer-events-none absolute inset-0" style={{ background: background!, mixBlendMode: "multiply" }} />
      )}
    </div>
  );
}
