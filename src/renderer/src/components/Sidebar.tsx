import { useState } from "react";
import { newId, useStation } from "../state/store";
import { bytesFor, evictBytes } from "../engine/bytesCache";
import { evictSource } from "../engine/thumbnails";
import { PagePicker } from "./PagePicker";
import type { ImportedPdf, PageRef, SourceDoc } from "../../../shared/types";

const NEW_MD_TEMPLATE = `# Título del documento

Escribe aquí. **Negritas**, *cursivas*, listas:

- Primer punto
- Segundo punto

## Sección

> Una cita elegante.
`;

interface SidebarProps {
  onOpenDoc: (docId: string) => void;
}

export function Sidebar({ onOpenDoc }: SidebarProps) {
  const { project, dispatch } = useStation();
  const [queue, setQueue] = useState<ImportedPdf[]>([]);

  function createDoc(kind: "md" | "html") {
    const n = project.docs.length + 1;
    const doc: SourceDoc = {
      id: newId(),
      name: `Documento ${n}${kind === "md" ? ".md" : ".html"}`,
      kind,
      content: kind === "md" ? NEW_MD_TEMPLATE : "<h1>Título del documento</h1>\n<p>Escribe aquí.</p>",
      preset: "sanbluedot",
      signature: "professional",
      academicLine: "",
      compiledB64: null
    };
    dispatch({ type: "addDoc", doc });
    onOpenDoc(doc.id);
  }

  async function handleImport() {
    const files = await window.station.importPdfDialog();
    if (!files.length) return;
    setQueue((q) => [...q, ...files.map((f) => ({ id: newId(), name: f.name, bytesB64: f.bytesB64 }))]);
  }

  const current = queue[0] ?? null;

  function confirmCurrent(indices: number[]) {
    if (!current) return;
    const pageRefs: PageRef[] = indices.map((i) => ({
      id: newId(),
      srcId: current.id,
      srcKind: "pdf",
      pageIndex: i,
      rotation: 0,
      background: null,
      patches: []
    }));
    dispatch({ type: "addPdf", pdf: current, pageRefs });
    setQueue((q) => q.slice(1));
  }

  function cancelCurrent() {
    if (current) {
      evictSource(current.id);
      evictBytes(current.id);
    }
    setQueue((q) => q.slice(1));
  }

  function removeSource(srcId: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}" y todas sus páginas del documento?`)) return;
    dispatch({ type: "removeSource", srcId });
    evictSource(srcId);
    evictBytes(srcId);
  }

  const sources = [
    ...project.pdfs.map((p) => ({ id: p.id, name: p.name, kind: "PDF" as const, isDoc: false })),
    ...project.docs.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind === "md" ? ("MD" as const) : ("HTML" as const),
      isDoc: true
    }))
  ];

  return (
    <aside
      className="flex w-[290px] shrink-0 flex-col border-r"
      style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="section-label">Fuentes</div>
        <span className="text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          {sources.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 px-4 pb-3">
        <button
          className="btn-ghost w-full"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
          onClick={handleImport}
        >
          ＋ Importar PDF
        </button>
        <div className="flex gap-1.5">
          <button className="btn-ghost flex-1" onClick={() => createDoc("md")}>
            ＋ Doc MD
          </button>
          <button className="btn-ghost flex-1" onClick={() => createDoc("html")}>
            ＋ Doc HTML
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {sources.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Sin fuentes todavía. Importa un PDF para empezar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((s) => {
              const inUse = project.pages.filter((p) => p.srcId === s.id).length;
              return (
                <li
                  key={s.id}
                  className={`group flex items-center gap-2 rounded-md border px-2 py-2 ${s.isDoc ? "cursor-pointer" : ""}`}
                  style={{ borderColor: "var(--border)" }}
                  onClick={s.isDoc ? () => onOpenDoc(s.id) : undefined}
                  title={s.isDoc ? "Abrir en el editor" : s.name}
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ fontFamily: "var(--mono)", background: "var(--accent-soft)", color: "var(--text-label)" }}
                  >
                    {s.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={s.name}>
                    {s.name}
                  </span>
                  <span className="shrink-0 text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
                    {inUse} pág
                  </span>
                  <button
                    className="shrink-0 rounded px-1 text-[13px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--danger)" }}
                    title="Eliminar fuente"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSource(s.id, s.name);
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {current && (
        <PagePicker
          name={current.name}
          srcId={current.id}
          bytes={bytesFor(current.id, current.bytesB64)}
          onConfirm={confirmCurrent}
          onClose={cancelCurrent}
        />
      )}
    </aside>
  );
}
