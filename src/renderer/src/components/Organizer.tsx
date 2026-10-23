import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { useStation } from "../state/store";
import { effectiveBackground, sourceFor } from "../engine/sources";
import { useModalOpen } from "./Modal";
import { PageCard } from "./PageCard";
import { ReaderView } from "./ReaderView";
import { Thumbnail } from "./Thumbnail";
import type { PageRef } from "../../../shared/types";

interface Props {
  /** Petición externa (cola de documentos): abrir la vista lectura en esta página */
  openAt: string | null;
  onOpenConsumed: () => void;
}

export function Organizer({ openAt, onOpenConsumed }: Props) {
  const { project, selection, dispatch } = useStation();
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{ index: number; side: "left" | "right" } | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null); // vista lectura estilo Adobe
  // Ancla del shift-click: la última página elegida SIN shift (no la última del rango)
  const anchorId = useRef<string | null>(null);

  const pages = project.pages;
  const modalOpen = useModalOpen();

  // Click en un PDF de la cola → lectura en su primera página
  useEffect(() => {
    if (!openAt) return;
    if (pages.some((p) => p.id === openAt)) {
      setReaderId(openAt);
      dispatch({ type: "select", ids: [openAt] });
    }
    onOpenConsumed();
  }, [openAt, pages, dispatch, onOpenConsumed]);

  // Atajos: Delete elimina la selección, Cmd/Ctrl+A selecciona todo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (modalOpen) return; // las páginas ocultas bajo un diálogo no se tocan
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.tagName === "BUTTON" || t.isContentEditable) return;
      if (readerId) return; // la vista lectura maneja sus propias teclas
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
  }, [selection, pages, dispatch, readerId, modalOpen]);

  function openReader(id: string) {
    setReaderId(id);
    dispatch({ type: "select", ids: [id] });
  }

  function handleSelect(e: MouseEvent | ReactKeyboardEvent, page: PageRef, index: number) {
    e.stopPropagation();
    if (e.shiftKey && selection.length > 0) {
      const anchorIdx = pages.findIndex((p) => p.id === (anchorId.current ?? selection[selection.length - 1]));
      if (anchorIdx !== -1) {
        const [a, b] = anchorIdx < index ? [anchorIdx, index] : [index, anchorIdx];
        dispatch({ type: "select", ids: pages.slice(a, b + 1).map((p) => p.id) });
        return;
      }
    }
    anchorId.current = page.id;
    if (e.metaKey || e.ctrlKey) {
      dispatch({ type: "toggleSelect", id: page.id });
    } else {
      dispatch({ type: "select", ids: [page.id] });
    }
  }

  /** Alt+flecha sobre una tarjeta: mueve la página (o toda su selección) una posición. */
  function handleNudge(page: PageRef, dir: -1 | 1) {
    const ids = selection.includes(page.id) ? selection : [page.id];
    const idxs = pages.flatMap((p, i) => (ids.includes(p.id) ? [i] : []));
    if (idxs.length === 0) return;
    const first = idxs[0];
    const last = idxs[idxs.length - 1];
    if ((dir === -1 && first === 0) || (dir === 1 && last === pages.length - 1)) return;
    dispatch({ type: "movePages", ids, toIndex: dir === -1 ? first - 1 : last + 2 });
    // Mover el nodo en el DOM suelta el foco: se devuelve a la tarjeta tras el render
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)?.focus());
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

  function handleDrop(e: DragEvent) {
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
      className={`btn-ghost${danger ? " btn-danger" : ""}`}
      title={title}
      aria-label={title}
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
      {/* Toolbar del organizador — solo acciones de página */}
      <div
        className="flex h-[46px] shrink-0 items-center gap-2 border-b px-3"
        style={{ background: "var(--panel-header)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {readerId ? (
          <button className="btn-ghost" onClick={() => setReaderId(null)} title="Volver a la grilla (Esc)">
            ▦ Grilla
          </button>
        ) : (
          <button
            className="btn-ghost"
            disabled={pages.length === 0}
            onClick={() => openReader((selection[0] && pages.find((p) => p.id === selection[0])?.id) || pages[0].id)}
            title="Vista lectura — scroll continuo (también con doble clic en una página)"
          >
            ◫ Lectura
          </button>
        )}
        {btn("↺", "Rotar 90° a la izquierda", () => dispatch({ type: "rotatePages", ids: selection, delta: -90 }))}
        {btn("↻", "Rotar 90° a la derecha", () => dispatch({ type: "rotatePages", ids: selection, delta: 90 }))}
        {btn("Duplicar", "Duplicar selección", () => dispatch({ type: "duplicatePages", ids: selection }))}
        {btn("Eliminar", "Eliminar selección (Supr)", () => dispatch({ type: "removePages", ids: selection }), true)}

        <span className="ml-auto text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          {pages.length} páginas{selection.length > 0 && ` · ${selection.length} seleccionadas`}
        </span>
      </div>

      {readerId ? (
        <ReaderView initialId={readerId} onClose={() => setReaderId(null)} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {pages.length === 0 ? (
            <div
              className="empty-canvas flex h-full items-center justify-center rounded-lg border-2 border-dashed"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="empty-canvas-copy">
                <strong>El documento está vacío</strong>
                <span>Arrastra un PDF, Markdown o HTML al panel de la izquierda.</span>
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Páginas del documento (Alt + flechas para reordenar)"
            >
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
                    onOpen={() => openReader(p.id)}
                    onNudge={(dir) => handleNudge(p, dir)}
                    onDragStart={(e) => handleDragStart(e, p)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  >
                    <Thumbnail
                      srcId={p.srcId}
                      bytes={src.bytes}
                      pageIndex={p.pageIndex}
                      rotation={p.rotation}
                      background={effectiveBackground(project, p)}
                      tint={Boolean(p.tint)}
                      width={150}
                    />
                  </PageCard>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
