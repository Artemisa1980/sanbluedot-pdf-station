import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Thumbnail } from "./Thumbnail";
import { getPageCount } from "../engine/thumbnails";

interface Props {
  name: string;
  srcId: string;
  bytes: Uint8Array;
  onConfirm: (indices: number[]) => void;
  onClose: () => void;
}

/** Selector hoja por hoja: elige exactamente qué páginas del PDF entran al documento maestro. */
export function PagePicker({ name, srcId, bytes, onConfirm, onClose }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    getPageCount(srcId, bytes).then((n) => {
      if (!alive) return;
      setCount(n);
      setSel(new Set(Array.from({ length: n }, (_, i) => i))); // default: todas
    });
    return () => {
      alive = false;
    };
  }, [srcId, bytes]);

  function toggle(i: number) {
    setSel((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[860px] flex-col overflow-hidden"
        style={{ background: "var(--panel-bg)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
        >
          <div className="min-w-0">
            <div className="section-label">Importar páginas</div>
            <div className="truncate text-sm font-medium">{name}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="btn-ghost"
              onClick={() => count !== null && setSel(new Set(Array.from({ length: count }, (_, i) => i)))}
            >
              Todas
            </button>
            <button className="btn-ghost" onClick={() => setSel(new Set())}>
              Ninguna
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {count === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Leyendo el PDF…
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: count }, (_, i) => {
                const active = sel.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className="relative rounded-md border-2 p-1 text-left transition-colors"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      background: active ? "var(--accent-soft)" : "transparent"
                    }}
                  >
                    <Thumbnail srcId={srcId} bytes={bytes} pageIndex={i} width={140} />
                    <div className="mt-1 flex items-center justify-between px-1">
                      <span className="text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
                        {i + 1}
                      </span>
                      <span
                        className="inline-block h-3 w-3 rounded-sm border"
                        style={{
                          borderColor: active ? "var(--accent)" : "var(--border)",
                          background: active ? "var(--accent)" : "transparent"
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer
          className="flex items-center justify-between border-t px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-xs" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
            {sel.size} de {count ?? "…"} seleccionadas
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-ghost"
              style={{ borderColor: "var(--accent)", color: "var(--text)", background: "var(--accent-soft)" }}
              disabled={sel.size === 0}
              onClick={() => onConfirm([...sel].sort((a, b) => a - b))}
            >
              Agregar al documento
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
