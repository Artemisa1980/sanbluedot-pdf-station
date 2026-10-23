import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Modal } from "./Modal";
import { newId } from "../state/store";
import { getPageSizePt, renderPageDataUrl } from "../engine/thumbnails";
import { unsupportedPatchChars } from "../engine/exportProject";
import { normalizePatchText } from "../engine/projectFile";
import type { PageRef, Patch } from "../../../shared/types";

const PREVIEW_W = 640;
const SIZE_MIN = 6;
const SIZE_MAX = 72;
const DRAG_THRESHOLD_PX = 4; // arrastre mínimo para empezar un rectángulo nuevo

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
  const [loadError, setLoadError] = useState(false);
  const [pagePt, setPagePt] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<Pick<Patch, "x" | "y" | "w" | "h"> | null>(
    initial ? { x: initial.x, y: initial.y, w: initial.w, h: initial.h } : null
  );
  const [color, setColor] = useState(initial?.color ?? page.background ?? "#ffffff");
  const [text, setText] = useState(initial?.text ?? "");
  const [textColor, setTextColor] = useState(initial?.textColor ?? "#16213e");
  const [fontSize, setFontSize] = useState(initial?.fontSize ?? 11);
  // Texto del campo de tamaño: se puede vaciar y teclear libremente; se ajusta a 6–72 al salir
  const [sizeText, setSizeText] = useState(String(initial?.fontSize ?? 11));
  // started=false hasta pasar el umbral de arrastre: un clic suelto no toca el rectángulo existente
  const drawing = useRef<{ x0: number; y0: number; cx: number; cy: number; started: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoadError(false);
    renderPageDataUrl(page.srcId, bytes, page.pageIndex, PREVIEW_W)
      .then((u) => alive && setImg(u))
      .catch(() => alive && setLoadError(true));
    getPageSizePt(page.srcId, bytes, page.pageIndex)
      .then((s) => alive && setPagePt(s))
      .catch(() => alive && setLoadError(true));
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
    drawing.current = { x0: p.x, y0: p.y, cx: e.clientX, cy: e.clientY, started: false };
  }
  function onMove(e: MouseEvent) {
    const d = drawing.current;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < DRAG_THRESHOLD_PX) return;
      d.started = true;
    }
    const p = norm(e);
    const { x0, y0 } = d;
    setRect({
      x: Math.min(x0, p.x),
      y: Math.min(y0, p.y),
      w: Math.abs(p.x - x0),
      h: Math.abs(p.y - y0)
    });
  }
  function onUp() {
    const d = drawing.current;
    drawing.current = null;
    if (!d?.started) return; // sin arrastre real no se borra ni se cambia nada
    setRect((r) => (r && (r.w < 0.005 || r.h < 0.005) ? null : r));
  }

  /** Tamaño final del campo: vacío o inválido vuelve al último válido; fuera de rango se ajusta a 6–72 */
  function commitSize(): number {
    const v = Number(sizeText);
    if (sizeText.trim() === "" || !Number.isFinite(v)) return fontSize;
    return Math.min(SIZE_MAX, Math.max(SIZE_MIN, v));
  }

  // Escala exacta pt→px para que el texto del overlay mida lo que medirá en el PDF
  const fontPx = pagePt ? fontSize * (PREVIEW_W / pagePt.width) : fontSize;
  // El PDF dibuja el texto del parche con Helvetica estándar: avisar antes de guardar lo que no puede dibujar
  // Un tab o \r pegado se normaliza al guardar (igual que al abrir un proyecto): no bloquea ni deja caracteres invisibles
  const cleanText = normalizePatchText(text);
  const badChars = unsupportedPatchChars(cleanText);
  const canSave = rect !== null && badChars.length === 0;

  return (
    <Modal
      labelledBy="patch-title"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-6"
      panelClassName="card-retro flex max-h-full gap-0 overflow-hidden"
      panelStyle={{ boxShadow: "5px 5px 0 var(--shadow-ink)" }}
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
          ) : loadError ? (
            <div
              className="flex h-[820px] w-full items-center justify-center p-6 text-center text-[12px]"
              role="alert"
              style={{ background: "var(--input-bg)", color: "var(--danger)", fontFamily: "var(--mono)" }}
            >
              No se pudo mostrar la página para dibujar el parche. Cierra el editor y vuelve a abrirlo.
            </div>
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
        <div id="patch-title" className="section-label">
          Parche
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Arrastra sobre la página para dibujar el rectángulo. El parche tapa lo que esté debajo —
          el original no se modifica.
        </p>

        <label className="section-label" htmlFor="patch-color">
          Color del parche
        </label>
        <input id="patch-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />

        <label className="section-label" htmlFor="patch-text">
          Texto (opcional)
        </label>
        <textarea
          id="patch-text"
          className="h-24 resize-none rounded border p-2 text-[12px]"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Texto de corrección…"
        />
        {badChars.length > 0 && (
          <p className="text-[11px]" style={{ color: "var(--danger)" }}>
            El PDF no puede dibujar {badChars.join(" ")} en un parche. Cámbialo por texto: por ejemplo «-&gt;» en vez
            de «→». Las tildes, la ñ, ¿¡ y € sí funcionan.
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="section-label" htmlFor="patch-text-color">
              Color texto
            </label>
            <input id="patch-text-color" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="section-label" htmlFor="patch-size">
              Tamaño (pt)
            </label>
            <input
              id="patch-size"
              type="number"
              min={6}
              max={72}
              className="w-full rounded border px-2 py-1 text-[12px]"
              style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
              value={sizeText}
              onChange={(e) => {
                // El campo acepta lo que se escribe (también vacío); la vista previa solo
                // toma tamaños válidos 6–72 — un tamaño ≤ 0 dejaba el proyecto imposible de reabrir
                setSizeText(e.target.value);
                const v = Number(e.target.value);
                if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= SIZE_MIN && v <= SIZE_MAX) setFontSize(v);
              }}
              onBlur={() => {
                const committed = commitSize();
                setFontSize(committed);
                setSizeText(String(committed));
              }}
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
                  text: cleanText,
                  textColor,
                  fontSize: commitSize()
                });
                onClose();
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
