import { useEffect, useState } from "react";
import { renderPageDataUrl } from "../engine/thumbnails";
import type { Rotation } from "../../../shared/types";

interface Props {
  srcId: string;
  bytes: Uint8Array;
  pageIndex: number;
  rotation?: Rotation;
  background?: string | null;
  width?: number;
}

export function Thumbnail({ srcId, bytes, pageIndex, rotation = 0, background = null, width = 180 }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    renderPageDataUrl(srcId, bytes, pageIndex, width)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [srcId, bytes, pageIndex, width]);

  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden"
      style={{
        aspectRatio: "17 / 22", // proporción Letter — contenedor estable mientras carga
        backgroundColor: background ?? "#ffffff",
        borderRadius: "4px"
      }}
    >
      {url ? (
        <img
          src={url}
          alt={`Página ${pageIndex + 1}`}
          className="max-h-full max-w-full"
          style={{
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            // multiply: el blanco del render toma el color de fondo — solo tinte de preview
            mixBlendMode: background ? "multiply" : undefined
          }}
          draggable={false}
        />
      ) : (
        <div className="h-full w-full animate-pulse" style={{ background: "var(--input-bg)" }} />
      )}
    </div>
  );
}
