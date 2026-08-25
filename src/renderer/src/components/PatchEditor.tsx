import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { newId } from "../state/store";
import { getPageSizePt, renderPageDataUrl } from "../engine/thumbnails";
import type { PageRef, Patch } from "../../../shared/types";

const PREVIEW_W = 640;

interface Props {
  page: PageRef;
  bytes: Uint8Array;
  initial: Patch | null; // null = parche nuevo
  onSave: (patch: Patch) => void;
  onDelete: (patchId: string) => void;
  onClose: () => void;
}

/**
 * Editor de parches: dibuja un rectángulo arrastrando sobre la página y ponle texto.
 * Coordenadas normalizadas 0–1 con origen arriba-izquierda (el motor de exportación
 * las convierte a puntos PDF). Se dibuja sobre la página SIN rotar.
 */
export function PatchEditor({ page, bytes, initial, onSave, onDelete, onClose }: Props) {
  const [img, setImg] = useState<string | null>(null);
  const [pagePt, setPagePt] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<Pick<Patch, "x" | "y" | "w" | "h"> | null>(
    initial ? { x: initial.x, y: initial.y, w: initial.w, h: initial.h } : null
  );
  const [color, setColor] = useState(initial?.color ?? page.background ?? "#ffffff");
  const [text, setText] = useState(initial?.text ?? "");
  const [textColor, setTextColor] = useState(initial?.textColor ?? "#16213e");
  const [fontSize, setFontSize] = useState(initial?.fontSize ?? 11);
  const drawing = useRef<{ x0: number; y0: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    renderPageDataUrl(page.srcId, bytes, page.pageIndex, PREVIEW_W).then((u) => alive && setImg(u));
    getPageSizePt(page.srcId, bytes, page.pageIndex).then((s) => alive && setPagePt(s));
    return () => {
      alive = false;
    };
  }, [page.srcId, page.pageIndex, bytes]);

  function norm(e: MouseEvent): { x: number; y: number } {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    };
  }

  function onDown(e: MouseEvent) {
    const p = norm(e);
    drawing.current = { x0: p.x, y0: p.y };
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onMove(e: MouseEvent) {
    if (!drawing.current) return;
    const p = norm(e);
    const { x0, y0 } = drawing.current;
    setRect({
      x: Math.min(x0, p.x),
      y: Math.min(y0, p.y),
      w: Math.abs(p.x - x0),
      h: Math.abs(p.y - y0)
    });
  }
  function onUp() {
    drawing.current = null;
    setRect((r) => (r && (r.w < 0.005 || r.h < 0.005) ? null : r));
  }

  // Escala exacta pt→px para que el texto del overlay mida lo que medirá en el PDF
  const fontPx = pagePt ? fontSize * (PREVIEW_W / pagePt.width) : fontSize;
  const canSave = rect !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="card-retro flex max-h-full gap-0 overflow-hidden"
        style={{ boxShadow: "5px 5px 0 var(--shadow-ink)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Página + dibujo */}
        <div className="flex max-h-[85vh] items-start overflow-auto p-4">
          <div
            ref={boxRef}
            className="relative select-none"
            style={{ width: PREVIEW_W, cursor: "crosshair" }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
          >
            {img ? (
              <img src={img} width={PREVIEW_W} alt="Página" draggable={false} />
            ) : (
              <div className="h-[820px] w-full animate-pulse" style={{ background: "var(--input-bg)" }} />
            )}
            {rect && (
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  background: color,
                  outline: "1.5px dashed var(--accent)"
                }}
              >
                {text && (
                  <div
                    style={{
                      padding: `${fontPx * 0.4}px`,
                      fontSize: `${fontPx}px`,
                      lineHeight: 1.3,
                      color: textColor,
                      whiteSpace: "pre-wrap",
                      fontFamily: "Helvetica, Arial, sans-serif"
                    }}
                  >
                    {text}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controles */}
        <div
          className="flex w-[260px] shrink-0 flex-col gap-3 border-l p-4"
          style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
        >
          <div className="section-label">Parche</div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Arrastra sobre la página para dibujar el rectángulo. El parche tapa lo que esté debajo —
            el original no se modifica.
          </p>

          <label className="section-label">Color del parche</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />

          <label className="section-label">Texto (opcional)</label>
          <textarea
            className="h-24 resize-none rounded border p-2 text-[12px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Texto de corrección…"
          />

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="section-label">Color texto</label>
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="section-label">Tamaño (pt)</label>
              <input
                type="number"
                min={6}
                max={72}
                className="w-full rounded border px-2 py-1 text-[12px]"
                style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value) || 11)}
              />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {initial && (
              <button
                className="btn-ghost btn-danger"
                onClick={() => {
                  onDelete(initial.id);
                  onClose();
                }}
              >
                Eliminar parche
              </button>
            )}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn-ghost btn-soft flex-1"
                style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
                disabled={!canSave}
                onClick={() => {
                  if (!rect) return;
                  onSave({
                    id: initial?.id ?? newId(),
                    ...rect,
                    color,
                    text,
                    textColor,
                    fontSize
                  });
                  onClose();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
