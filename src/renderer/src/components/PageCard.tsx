import type { DragEvent, MouseEvent, ReactNode } from "react";
import type { PageRef } from "../../../shared/types";

interface Props {
  page: PageRef;
  index: number;
  sourceName: string;
  selected: boolean;
  dropSide: "left" | "right" | null;
  onSelect: (e: MouseEvent) => void;
  onOpen: () => void; // doble clic → vista individual
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
  children: ReactNode; // la Thumbnail
}

/** Tarjeta de página estilo cartucho: seleccionable, arrastrable, con barra de inserción. */
export function PageCard({
  page,
  index,
  sourceName,
  selected,
  dropSide,
  onSelect,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children
}: Props) {
  return (
    <div
      className="relative cursor-pointer rounded-lg border-2 p-1.5 transition-colors"
      style={{
        borderColor: selected ? "var(--accent)" : "var(--border-strong)",
        background: selected ? "var(--accent-soft)" : "var(--panel-bg)",
        boxShadow: selected ? "3px 3px 0 rgba(124, 179, 232, 0.45)" : "var(--retro-sm)"
      }}
      draggable
      onClick={onSelect}
      onDoubleClick={onOpen}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {dropSide && (
        <div
          className="absolute top-0 bottom-0 z-10 w-[3px] rounded"
          style={{
            background: "var(--accent)",
            [dropSide === "left" ? "left" : "right"]: "-8px"
          }}
        />
      )}

      {children}

      <div className="mt-1 flex items-center gap-1 px-0.5">
        <span
          className="shrink-0 text-[10px] font-bold"
          style={{ fontFamily: "var(--mono)", color: "var(--text-label)" }}
        >
          {index + 1}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[10px]"
          style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}
          title={sourceName}
        >
          {sourceName}
        </span>
        {page.background && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border"
            style={{ background: page.background, borderColor: "var(--border)" }}
            title={`Fondo ${page.background}`}
          />
        )}
        {page.patches.length > 0 && (
          <span
            className="shrink-0 text-[9px]"
            style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}
            title={`${page.patches.length} parche(s)`}
          >
            ◧{page.patches.length}
          </span>
        )}
      </div>
    </div>
  );
}
