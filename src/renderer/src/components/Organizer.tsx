import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { useStation } from "../state/store";
import { sourceFor } from "../engine/sources";
import { PageCard } from "./PageCard";
import { Thumbnail } from "./Thumbnail";
import type { MarginPreset, PageRef, PageSize } from "../../../shared/types";

export function Organizer() {
  const { project, selection, dispatch } = useStation();
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{ index: number; side: "left" | "right" } | null>(null);

  const pages = project.pages;

  // Atajos: Delete elimina la selección, Cmd/Ctrl+A selecciona todo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
        e.preventDefault();
        dispatch({ type: "removePages", ids: selection });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        dispatch({ type: "select", ids: pages.map((p) => p.id) });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, pages, dispatch]);

  function handleSelect(e: MouseEvent, page: PageRef, index: number) {
    e.stopPropagation();
    if (e.shiftKey && selection.length > 0) {
      const anchorId = selection[selection.length - 1];
      const anchorIdx = pages.findIndex((p) => p.id === anchorId);
      if (anchorIdx !== -1) {
        const [a, b] = anchorIdx < index ? [anchorIdx, index] : [index, anchorIdx];
        dispatch({ type: "select", ids: pages.slice(a, b + 1).map((p) => p.id) });
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      dispatch({ type: "toggleSelect", id: page.id });
    } else {
      dispatch({ type: "select", ids: [page.id] });
    }
  }

  function handleDragStart(e: DragEvent, page: PageRef) {
    const ids = selection.includes(page.id) ? selection : [page.id];
    if (!selection.includes(page.id)) dispatch({ type: "select", ids: [page.id] });
    setDragIds(ids);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (!dragIds) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
    setDrop({ index, side });
  }

  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (!dragIds || !drop) return;
    const toIndex = drop.index + (drop.side === "right" ? 1 : 0);
    dispatch({ type: "movePages", ids: dragIds, toIndex });
    setDragIds(null);
    setDrop(null);
  }

  function handleDragEnd() {
    setDragIds(null);
    setDrop(null);
  }

  const btn = (label: string, title: string, onClick: () => void, danger = false) => (
    <button
      className="btn-ghost"
      style={danger ? { borderColor: "var(--danger)", color: "var(--danger)", background: "var(--danger-soft)" } : undefined}
      title={title}
      disabled={selection.length === 0}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <section
      className="flex min-w-0 flex-1 flex-col"
      onClick={() => selection.length > 0 && dispatch({ type: "select", ids: [] })}
    >
      {/* Toolbar del organizador */}
      <div
        className="flex h-[44px] shrink-0 items-center gap-2 border-b px-4"
        style={{ background: "var(--panel-header)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {btn("↺", "Rotar 90° a la izquierda", () => dispatch({ type: "rotatePages", ids: selection, delta: -90 }))}
        {btn("↻", "Rotar 90° a la derecha", () => dispatch({ type: "rotatePages", ids: selection, delta: 90 }))}
        {btn("Duplicar", "Duplicar selección", () => dispatch({ type: "duplicatePages", ids: selection }))}
        {btn("Eliminar", "Eliminar selección (Supr)", () => dispatch({ type: "removePages", ids: selection }), true)}

        <span className="ml-2 text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          {pages.length} páginas{selection.length > 0 && ` · ${selection.length} seleccionadas`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <label className="section-label" htmlFor="pageSize">
            Página
          </label>
          <select
            id="pageSize"
            className="btn-ghost"
            style={{ background: "var(--input-bg)" }}
            value={project.pageSize}
            onChange={(e) => dispatch({ type: "setPageSize", value: e.target.value as PageSize })}
          >
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
          <label className="section-label" htmlFor="margins">
            Márgenes
          </label>
          <select
            id="margins"
            className="btn-ghost"
            style={{ background: "var(--input-bg)" }}
            value={project.margins}
            onChange={(e) => dispatch({ type: "setMargins", value: e.target.value as MarginPreset })}
          >
            <option value="compact">Compacto</option>
            <option value="apa">APA (1")</option>
          </select>
        </div>
      </div>

      {/* Grilla de páginas */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {pages.length === 0 ? (
          <div
            className="flex h-full items-center justify-center rounded-lg border-2 border-dashed"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              El documento está vacío — importa un PDF o crea un documento en FUENTES.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {pages.map((p, i) => {
              const src = sourceFor(project, p);
              if (!src) return null;
              return (
                <PageCard
                  key={p.id}
                  page={p}
                  index={i}
                  sourceName={`${src.name} p.${p.pageIndex + 1}`}
                  selected={selection.includes(p.id)}
                  dropSide={drop?.index === i ? drop.side : null}
                  onSelect={(e) => handleSelect(e, p, i)}
                  onDragStart={(e) => handleDragStart(e, p)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <Thumbnail
                    srcId={p.srcId}
                    bytes={src.bytes}
                    pageIndex={p.pageIndex}
                    rotation={p.rotation}
                    background={p.background}
                    width={150}
                  />
                </PageCard>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
