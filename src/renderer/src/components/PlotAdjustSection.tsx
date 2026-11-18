import { useId, useMemo, useState } from "react";
import type { SourceDoc } from "../../../shared/types";
import { DEFAULT_X_DOMAIN, defaultLabelDy, type ChartPoint, type ChartSpec } from "../engine/chart";
import { resolveStyle } from "../engine/presets";
import { parsePlotBlocks, updatePlotBlockInContent } from "../engine/plotBlocks";

interface Props {
  doc: SourceDoc;
  onUpdateContent: (newContent: string) => void;
}

/**
 * Panel interactivo para ajustar gráficas vectoriales (```plot) dentro del documento.
 * Permite cambiar en tiempo real márgenes, dominios, visibilidad de reglas y
 * desplazamientos (dx, dy, anchor) de los vértices y etiquetas sin tocar código.
 */
export function PlotAdjustSection({ doc, onUpdateContent }: Props) {
  const [selectedPlotIdx, setSelectedPlotIdx] = useState(0);
  const [selectedPointIdx, setSelectedPointIdx] = useState(0);
  const plotSelectId = useId();
  const pointSelectId = useId();

  const blocks = useMemo(() => {
    if (doc.kind !== "md") return [];
    return parsePlotBlocks(doc.content);
  }, [doc.content, doc.kind]);

  if (blocks.length === 0) {
    return (
      <section className="card-retro p-3">
        <div className="section-label mb-2">Ajuste de gráficas</div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Este documento no tiene gráficas. Se escriben en un bloque <code>```plot</code>.
        </p>
      </section>
    );
  }

  const safePlotIdx = selectedPlotIdx < blocks.length ? selectedPlotIdx : 0;
  const currentBlock = blocks[safePlotIdx] ?? blocks[0];
  const spec = currentBlock.spec;
  const points = spec.points ?? [];
  const safePointIdx = selectedPointIdx < points.length ? selectedPointIdx : 0;
  const currentPoint = points[safePointIdx] ?? points[0];
  // Los mismos valores por defecto que usa el motor: el panel nunca muestra un rango inventado
  const xDomain = spec.domain ?? DEFAULT_X_DOMAIN;
  const baseDy = defaultLabelDy(resolveStyle(doc).fontSizePt);

  function handleUpdateSpec(patch: Partial<ChartSpec>) {
    const updatedSpec: ChartSpec = {
      ...spec,
      ...patch
    };
    const newContent = updatePlotBlockInContent(doc.content, currentBlock.index, updatedSpec);
    onUpdateContent(newContent);
  }

  function handleUpdatePoint(patch: Partial<ChartPoint>) {
    if (points.length === 0) return;
    const pointIdx = safePointIdx < points.length ? safePointIdx : 0;
    const newPoints = points.map((p, i) => (i === pointIdx ? { ...p, ...patch } : p));
    handleUpdateSpec({ points: newPoints });
  }

  return (
    <section className="card-retro p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="section-label">Ajuste de gráficas</div>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-bold"
          style={{ background: "var(--accent-soft)", color: "var(--text)" }}
        >
          {blocks.length} {blocks.length === 1 ? "gráfica" : "gráficas"}
        </span>
      </div>

      {/* Selector de gráfica (cuando hay más de una) */}
      {blocks.length > 1 && (
        <div className="mb-3">
          <label className="section-label mb-1" htmlFor={plotSelectId}>
            Gráfica activa
          </label>
          <select
            id={plotSelectId}
            className="btn-ghost w-full text-left"
            style={{ background: "var(--control-bg)" }}
            value={selectedPlotIdx}
            onChange={(e) => {
              setSelectedPlotIdx(Number(e.target.value));
              setSelectedPointIdx(0);
            }}
          >
            {blocks.map((b, idx) => (
              <option key={idx} value={idx}>
                {idx + 1}. {b.spec.title || `Gráfica ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Título de la gráfica */}
      <div className="mb-3">
        <label className="section-label mb-1 block">Título</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1 text-[11px]"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
          value={spec.title || ""}
          onChange={(e) => handleUpdateSpec({ title: e.target.value })}
          placeholder="Sin título…"
        />
      </div>

      {/* Márgenes y Dominios Cartianos */}
      <div className="mb-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <div className="section-label mb-1.5">Dominio y Escala</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              X Mín / Máx
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                className="w-full rounded border px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
                value={xDomain[0]}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) {
                    handleUpdateSpec({
                      domain: [val, xDomain[1]]
                    });
                  }
                }}
              />
              <input
                type="number"
                step="any"
                className="w-full rounded border px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
                value={xDomain[1]}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) {
                    handleUpdateSpec({
                      domain: [xDomain[0], val]
                    });
                  }
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Y Mín / Máx
              </label>
              {/* Volver al rango automático: borrar los campos no lo hace (un campo vacío no es un número) */}
              {spec.yDomain && (
                <button
                  type="button"
                  className="btn-ghost px-1 py-0 text-[9px]"
                  title="Rango Y automático"
                  aria-label="Volver el rango Y a automático"
                  onClick={() => handleUpdateSpec({ yDomain: undefined })}
                >
                  Auto
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                className="w-full rounded border px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
                placeholder="auto"
                value={spec.yDomain ? spec.yDomain[0] : ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) {
                    handleUpdateSpec({
                      yDomain: [val, spec.yDomain ? spec.yDomain[1] : val + 10]
                    });
                  }
                }}
              />
              <input
                type="number"
                step="any"
                className="w-full rounded border px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
                placeholder="auto"
                value={spec.yDomain ? spec.yDomain[1] : ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) {
                    handleUpdateSpec({
                      yDomain: [spec.yDomain ? spec.yDomain[0] : val - 10, val]
                    });
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Interruptores de ejes y cuadrícula */}
        <div className="mt-2 flex flex-col gap-1 text-[11px]">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={spec.axes !== false}
              onChange={(e) => handleUpdateSpec({ axes: e.target.checked })}
            />
            <span>Ejes graduados (marcas y números)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={spec.rules !== false}
              onChange={(e) => handleUpdateSpec({ rules: e.target.checked })}
            />
            <span>Reglas cartesianas (x=0, y=0)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={spec.grid !== false}
              onChange={(e) => handleUpdateSpec({ grid: e.target.checked })}
            />
            <span>Cuadrícula de fondo</span>
          </label>
        </div>
      </div>

      {/* Editor de Vértices y Puntos Anotados */}
      {points.length > 0 && currentPoint && (
        <div className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <div className="section-label mb-1.5">Vértices y Etiquetas ({points.length})</div>

          {/* Selector de punto */}
          <div className="mb-2">
            <label className="section-label mb-1" htmlFor={pointSelectId}>
              Punto seleccionado
            </label>
            <select
              id={pointSelectId}
              className="btn-ghost w-full text-left"
              style={{ background: "var(--control-bg)" }}
              value={selectedPointIdx}
              onChange={(e) => setSelectedPointIdx(Number(e.target.value))}
            >
              {points.map((p, i) => (
                <option key={i} value={i}>
                  {i + 1}. {p.label ? p.label : `(${p.x}, ${p.y ?? 0})`}
                </option>
              ))}
            </select>
          </div>

          {/* Texto de la etiqueta */}
          <div className="mb-2">
            <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Etiqueta de texto
            </label>
            <input
              type="text"
              className="w-full rounded border px-2 py-1 text-[11px]"
              style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
              value={currentPoint.label || ""}
              onChange={(e) => handleUpdatePoint({ label: e.target.value })}
              placeholder="Texto del punto…"
            />
          </div>

          {/* Posición por lado: fija dx, dy y alineación de una vez; los deslizadores afinan */}
          <div className="mb-2">
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Posición respecto al punto
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {(
                [
                  ["Arriba", { dx: 0, dy: baseDy, anchor: "middle" }],
                  ["Abajo", { dx: 0, dy: -baseDy + 2, anchor: "middle" }],
                  ["Izq.", { dx: -10, dy: 0, anchor: "end" }],
                  ["Der.", { dx: 10, dy: 0, anchor: "start" }]
                ] as Array<[string, Pick<ChartPoint, "dx" | "dy" | "anchor">]>
              ).map(([label, pos]) => {
                const active =
                  (currentPoint.dx ?? 0) === pos.dx &&
                  (currentPoint.dy ?? baseDy) === pos.dy &&
                  (currentPoint.anchor ?? "middle") === pos.anchor;
                return (
                  <button
                    key={label}
                    type="button"
                    className={`btn-ghost px-1 py-1 text-[10px]${active ? "" : " btn-soft"}`}
                    style={active ? undefined : { background: "var(--input-bg)" }}
                    aria-pressed={active}
                    onClick={() => handleUpdatePoint(pos)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desplazamiento horizontal (dx) */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Offset horizontal (dx)</span>
              <span style={{ fontFamily: "var(--mono)" }}>{currentPoint.dx ?? 0}px</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost px-1.5 py-0.5 text-[10px]"
                title="Mover a la izquierda"
                onClick={() => handleUpdatePoint({ dx: (currentPoint.dx ?? 0) - 4 })}
              >
                ◀
              </button>
              <input
                type="range"
                min="-60"
                max="60"
                step="2"
                className="w-full cursor-pointer"
                value={currentPoint.dx ?? 0}
                onChange={(e) => handleUpdatePoint({ dx: Number(e.target.value) })}
              />
              <button
                className="btn-ghost px-1.5 py-0.5 text-[10px]"
                title="Mover a la derecha"
                onClick={() => handleUpdatePoint({ dx: (currentPoint.dx ?? 0) + 4 })}
              >
                ▶
              </button>
            </div>
          </div>

          {/* Desplazamiento vertical (dy) */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Offset vertical (dy: negativo sube)</span>
              <span style={{ fontFamily: "var(--mono)" }}>{currentPoint.dy ?? baseDy}px</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost px-1.5 py-0.5 text-[10px]"
                title="Mover hacia arriba"
                onClick={() => handleUpdatePoint({ dy: (currentPoint.dy ?? baseDy) - 4 })}
              >
                ▲
              </button>
              <input
                type="range"
                min="-60"
                max="60"
                step="2"
                className="w-full cursor-pointer"
                value={currentPoint.dy ?? baseDy}
                onChange={(e) => handleUpdatePoint({ dy: Number(e.target.value) })}
              />
              <button
                className="btn-ghost px-1.5 py-0.5 text-[10px]"
                title="Mover hacia abajo"
                onClick={() => handleUpdatePoint({ dy: (currentPoint.dy ?? baseDy) + 4 })}
              >
                ▼
              </button>
            </div>
          </div>

          {/* Alineación (anchor) y círculo (dot) */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Alineación
              </label>
              <select
                className="btn-ghost w-full"
                style={{ background: "var(--control-bg)" }}
                value={currentPoint.anchor || "middle"}
                onChange={(e) =>
                  handleUpdatePoint({
                    anchor: e.target.value as "start" | "middle" | "end"
                  })
                }
              >
                <option value="start">A la derecha (start)</option>
                <option value="middle">Centrado (middle)</option>
                <option value="end">A la izquierda (end)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-1.5 pb-1">
                <input
                  type="checkbox"
                  checked={currentPoint.dot !== false}
                  onChange={(e) => handleUpdatePoint({ dot: e.target.checked })}
                />
                <span>Círculo azul</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Los cambios actualizan el bloque <code>```plot</code> y se recompilan en vivo en el PDF.
      </p>
    </section>
  );
}
