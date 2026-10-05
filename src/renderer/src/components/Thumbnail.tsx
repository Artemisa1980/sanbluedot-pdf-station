import { useEffect, useState } from "react";
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
}

export function Thumbnail({ srcId, bytes, pageIndex, rotation = 0, background = null, tint = false, width = 180 }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const sideways = rotation === 90 || rotation === 270;
  const tinted = tint && background !== null;

  useEffect(() => {
    let alive = true;
    // Con fondo: render transparente y color debajo — idéntico a la capa de la exportación.
    // Teñida: render normal (hoja blanca) y el color encima en modo multiplicar.
    renderPageDataUrl(srcId, bytes, pageIndex, width, background !== null && !tinted)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [srcId, bytes, pageIndex, width, background, tinted]);

  return (
    <div
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
      ) : (
        <div className="h-full w-full animate-pulse" style={{ background: "var(--input-bg)" }} />
      )}
      {tinted && url && (
        <div className="pointer-events-none absolute inset-0" style={{ background: background!, mixBlendMode: "multiply" }} />
      )}
    </div>
  );
}
