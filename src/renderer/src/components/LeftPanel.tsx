import { useState, type DragEvent } from "react";
import { newId, useStation } from "../state/store";
import { bytesFor, evictBytes } from "../engine/bytesCache";
import { evictSource } from "../engine/thumbnails";
import { FONT_CHOICES, fontById } from "../engine/fonts";
import { PRESETS, presetById, resolveStyle } from "../engine/presets";
import { sourceFor } from "../engine/sources";
import { useMyStyles } from "../state/useMyStyles";
import { DraftsModal } from "./DraftsModal";
import { PagePicker } from "./PagePicker";
import { PatchEditor } from "./PatchEditor";
import { bytesToB64 } from "../../../shared/b64";
import type {
  CustomStylePreset,
  DocStyle,
  ImportedPdf,
  MarginPreset,
  PageRef,
  PageSize,
  Patch,
  SourceDoc
} from "../../../shared/types";

/* La firma viaja en el contenido: los docs nuevos nacen firmados y Sandy la borra si no la quiere */
const NEW_MD_TEMPLATE = `<table class="masthead" width="100%"><tr>
<td class="brand-cell"><span class="brand">sanblue<sup class="dot">dot</sup></span></td>
<td class="tagline-cell">retro dev-station</td>
</tr></table>

# Título del documento

Escribe aquí. **Negritas**, *cursivas*, listas:

- Primer punto
- Segundo punto

## Sección

> Una cita elegante.

<div class="site-footer">
<span class="brand">sanblue<sup class="dot">dot</sup></span> — retro dev-station
<span class="copyright">© ${new Date().getFullYear()} Sandy E. Quintero</span>
</div>
`;

const SWATCHES: Array<{ label: string; color: string }> = [
  { label: "Blanco", color: "#ffffff" },
  { label: "Crema", color: "#fbf9f3" },
  { label: "Sage", color: "#e4ebe6" },
  { label: "Navy", color: "#16213e" }
];

interface Props {
  editingDocId: string | null;
  onOpenDoc: (docId: string, view?: "editor" | "preview") => void;
  /** Click en un PDF de la cola → vista lectura en esa página */
  onOpenPdf: (pageId: string) => void;
  /** Docs recompilándose en segundo plano (estilo recién cambiado) */
  recompiling: Set<string>;
}

/** Panel izquierdo único: proyecto + cola de documentos + control estético. */
export function LeftPanel({ editingDocId, onOpenDoc, onOpenPdf, recompiling }: Props) {
  const { project, selection, dispatch } = useStation();
  const [queue, setQueue] = useState<ImportedPdf[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [patchTarget, setPatchTarget] = useState<{ pageId: string; patch: Patch | null } | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);

  /* ---------- importación (diálogo + drag & drop desde Finder) ---------- */

  function addDocFromFile(name: string, kind: "md" | "html", content: string): string {
    const doc: SourceDoc = {
      id: newId(),
      name,
      kind,
      content,
      preset: "sanbluedot",
      style: presetById("sanbluedot").base,
      compiledB64: null
    };
    dispatch({ type: "addDoc", doc });
    return doc.id;
  }

  async function handlePick() {
    const files = await window.station.importFilesDialog();
    let firstDoc: string | null = null;
    for (const f of files) {
      if (f.kind === "pdf") {
        setQueue((q) => [...q, { id: newId(), name: f.name, bytesB64: f.bytesB64 }]);
      } else {
        const id = addDocFromFile(f.name, f.kind, f.content);
        if (!firstDoc) firstDoc = id;
      }
    }
    if (firstDoc) onOpenDoc(firstDoc, "preview");
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    let firstDoc: string | null = null;
    for (const file of Array.from(e.dataTransfer.files)) {
      if (/\.pdf$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setQueue((q) => [...q, { id: newId(), name: file.name, bytesB64: bytesToB64(bytes) }]);
      } else if (/\.(md|markdown|html?|htm)$/i.test(file.name)) {
        const kind = /\.(html?|htm)$/i.test(file.name) ? "html" : "md";
        const id = addDocFromFile(file.name, kind, await file.text());
        if (!firstDoc) firstDoc = id;
      }
    }
    if (firstDoc) onOpenDoc(firstDoc, "preview");
  }

  function createDoc(kind: "md" | "html") {
    const n = project.docs.length + 1;
    const doc: SourceDoc = {
      id: newId(),
      name: `Documento ${n}${kind === "md" ? ".md" : ".html"}`,
      kind,
      content: kind === "md" ? NEW_MD_TEMPLATE : "<h1>Título del documento</h1>\n<p>Escribe aquí.</p>",
      preset: "sanbluedot",
      style: presetById("sanbluedot").base,
      compiledB64: null
    };
    dispatch({ type: "addDoc", doc });
    onOpenDoc(doc.id, "editor");
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

  /* ---------- fuentes ordenadas como capítulos (primera aparición en el maestro) ---------- */

  const sourceOrder: string[] = [];
  for (const p of project.pages) if (!sourceOrder.includes(p.srcId)) sourceOrder.push(p.srcId);

  const sources = [
    ...project.pdfs.map((p) => ({ id: p.id, name: p.name, kind: "PDF" as const, isDoc: false })),
    ...project.docs.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind === "md" ? ("MD" as const) : ("HTML" as const),
      isDoc: true
    }))
  ].sort((a, b) => {
    const ia = sourceOrder.indexOf(a.id);
    const ib = sourceOrder.indexOf(b.id);
    return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
  });

  /* ---------- contexto del control estético ---------- */

  const selectedPages = selection
    .map((id) => project.pages.find((p) => p.id === id))
    .filter((p): p is PageRef => Boolean(p));
  const singlePdfPage =
    selectedPages.length === 1 && selectedPages[0].srcKind === "pdf" ? selectedPages[0] : null;
  const pdfSelection = selectedPages.length > 0 && selectedPages.every((p) => p.srcKind === "pdf");

  // Doc activo: el abierto en el editor, o el de la página seleccionada
  const activeDocId =
    editingDocId ??
    (selectedPages.length > 0 && selectedPages.every((p) => p.srcKind === "doc" && p.srcId === selectedPages[0].srcId)
      ? selectedPages[0].srcId
      : null);
  const activeDoc = activeDocId ? project.docs.find((d) => d.id === activeDocId) ?? null : null;

  const singleSrc = singlePdfPage ? sourceFor(project, singlePdfPage) : null;

  function patchStyle(doc: SourceDoc, patch: Partial<DocStyle>) {
    dispatch({ type: "updateDoc", docId: doc.id, patch: { style: { ...resolveStyle(doc), ...patch } } });
  }

  return (
    <aside
      className="flex w-[312px] shrink-0 flex-col gap-3 overflow-auto border-r p-3"
      style={{ background: "var(--app-bg)", borderColor: "var(--border)" }}
    >
      {/* ══ PROYECTO ══ */}
      <section className="card-retro p-3">
        <div className="section-label mb-2">Proyecto</div>
        <input
          className="w-full rounded border px-2 py-1.5 text-[13px]"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
          value={project.name}
          onChange={(e) => dispatch({ type: "setName", value: e.target.value })}
          title="Nombre del proyecto"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="section-label flex-1" htmlFor="lp-pageSize">
            Página
          </label>
          <select
            id="lp-pageSize"
            className="btn-ghost"
            style={{ background: "var(--input-bg)" }}
            value={project.pageSize}
            onChange={(e) => dispatch({ type: "setPageSize", value: e.target.value as PageSize })}
          >
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <label className="section-label flex-1" htmlFor="lp-margins">
            Márgenes
          </label>
          <select
            id="lp-margins"
            className="btn-ghost"
            style={{ background: "var(--input-bg)" }}
            value={project.margins}
            onChange={(e) => dispatch({ type: "setMargins", value: e.target.value as MarginPreset })}
          >
            <option value="compact">Compacto</option>
            <option value="apa">APA (1")</option>
          </select>
        </div>
        <p className="mt-2 text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          {project.pages.length} pág · {project.pdfs.length} PDF · {project.docs.length} doc
        </p>
        <button
          className="btn-ghost tip mt-2 w-full"
          onClick={() => setShowDrafts(true)}
          data-tip="Ver y borrar el borrador automático de recuperación"
        >
          🗂 Borradores de recuperación
        </button>
      </section>

      {/* ══ COLA DE DOCUMENTOS ══ */}
      <section className="card-retro p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="section-label">Cola de documentos</div>
          <span className="chip" style={{ background: "var(--input-bg)", color: "var(--text-label)" }}>
            {sources.length} caps
          </span>
        </div>

        <div
          className={`dropzone tip flex flex-col items-center justify-center gap-1 px-3 py-4 text-center ${dragOver ? "drag-over" : ""}`}
          onClick={handlePick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          data-tip="PDF, Markdown o HTML"
        >
          <span className="text-[16px]" style={{ color: "var(--text-muted)" }}>
            ⇪
          </span>
          <span className="text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-label)" }}>
            Arrastra o haz clic para subir
          </span>
        </div>

        {sources.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {sources.map((s) => {
              const inUse = project.pages.filter((p) => p.srcId === s.id).length;
              const orderIdx = sourceOrder.indexOf(s.id);
              const firstPage = project.pages.find((p) => p.srcId === s.id);
              const clickable = s.isDoc || Boolean(firstPage);
              return (
                <li
                  key={s.id}
                  className={`group flex items-center gap-1.5 rounded-md border px-1.5 py-1.5 ${clickable ? "cursor-pointer" : ""}`}
                  style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}
                  onClick={
                    s.isDoc
                      ? () => onOpenDoc(s.id, "preview")
                      : firstPage
                        ? () => onOpenPdf(firstPage.id)
                        : undefined
                  }
                  title={s.isDoc ? "Abrir en el editor" : firstPage ? "Ver en la vista lectura" : s.name}
                >
                  <span className={`chip shrink-0 chip-${s.kind.toLowerCase()}`}>{s.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px]" title={s.name}>
                    {s.name}
                  </span>
                  <span
                    className="shrink-0 text-[9px]"
                    style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}
                    title={recompiling.has(s.id) ? "Aplicando el estilo nuevo…" : undefined}
                  >
                    {recompiling.has(s.id) ? "◌" : inUse}
                  </span>
                  <button
                    className="shrink-0 rounded px-0.5 text-[11px] disabled:opacity-25"
                    style={{ color: "var(--text-label)" }}
                    title="Subir capítulo completo"
                    disabled={orderIdx <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "moveSource", srcId: s.id, dir: -1 });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="shrink-0 rounded px-0.5 text-[11px] disabled:opacity-25"
                    style={{ color: "var(--text-label)" }}
                    title="Bajar capítulo completo"
                    disabled={orderIdx === -1 || orderIdx >= sourceOrder.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "moveSource", srcId: s.id, dir: 1 });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className="shrink-0 rounded px-0.5 text-[12px] opacity-0 transition-opacity group-hover:opacity-100"
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

        <div className="mt-2 flex gap-1.5">
          <button className="btn-ghost flex-1" onClick={() => createDoc("md")}>
            ＋ Capítulo MD
          </button>
          <button className="btn-ghost flex-1" onClick={() => createDoc("html")}>
            ＋ HTML
          </button>
        </div>
      </section>

      {/* ══ CONTROL ESTÉTICO ══ */}
      <section className="card-retro p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="section-label">Control estético</div>
          {activeDoc && recompiling.has(activeDoc.id) && (
            <span className="text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>
              ◌ aplicando…
            </span>
          )}
        </div>

        {activeDoc ? (
          <DocStyleControls doc={activeDoc} onPatch={patchStyle} />
        ) : pdfSelection ? (
          <div className="flex flex-col gap-3">
            {/* FONDO de páginas PDF */}
            <div>
              <div className="section-label mb-2">Fondo de página · {selectedPages.length} pág</div>
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s.color}
                    className="h-8 w-8 rounded-md border-2 transition-transform hover:scale-110"
                    style={{ background: s.color, borderColor: "var(--border-strong)" }}
                    title={s.label}
                    onClick={() => dispatch({ type: "setBackground", ids: selection, color: s.color })}
                  />
                ))}
                <label
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-2 text-[11px]"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  title="Color personalizado"
                >
                  ✎
                  <input
                    type="color"
                    className="h-0 w-0 opacity-0"
                    onChange={(e) => dispatch({ type: "setBackground", ids: selection, color: e.target.value })}
                  />
                </label>
              </div>
              <button
                className="btn-ghost mt-2 w-full"
                onClick={() => dispatch({ type: "setBackground", ids: selection, color: null })}
              >
                Quitar fondo
              </button>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Capa vectorial debajo del contenido original — nitidez intacta.
              </p>
            </div>

            {/* PARCHES — solo con exactamente 1 página */}
            {singlePdfPage && (
              <div>
                <div className="section-label mb-2">
                  Parches · pág {project.pages.indexOf(singlePdfPage) + 1}
                </div>
                {singlePdfPage.patches.length === 0 ? (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Sin parches en esta página.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {singlePdfPage.patches.map((patch, i) => (
                      <li key={patch.id}>
                        <button
                          className="btn-ghost flex w-full items-center gap-2 text-left"
                          onClick={() => setPatchTarget({ pageId: singlePdfPage.id, patch })}
                          title="Editar parche"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm border"
                            style={{ background: patch.color, borderColor: "var(--border)" }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {patch.text.trim() ? patch.text.split("\n")[0] : `Parche ${i + 1}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  className="btn-ghost mt-2 w-full"
                  style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
                  onClick={() => setPatchTarget({ pageId: singlePdfPage.id, patch: null })}
                >
                  ＋ Parche
                </button>
              </div>
            )}
            {selectedPages.length > 1 && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Para parches, selecciona una sola página.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Abre un documento o selecciona páginas en el organizador: aquí aparecen sus controles de
            estilo (documentos propios) o de fondo y parches (páginas PDF).
          </p>
        )}
      </section>

      {current && (
        <PagePicker
          name={current.name}
          srcId={current.id}
          bytes={bytesFor(current.id, current.bytesB64)}
          onConfirm={confirmCurrent}
          onClose={cancelCurrent}
        />
      )}

      {showDrafts && <DraftsModal onClose={() => setShowDrafts(false)} />}

      {patchTarget && singlePdfPage && singleSrc && (
        <PatchEditor
          page={singlePdfPage}
          bytes={singleSrc.bytes}
          initial={patchTarget.patch}
          onSave={(patch) =>
            dispatch(
              patchTarget.patch
                ? { type: "updatePatch", pageId: patchTarget.pageId, patch }
                : { type: "addPatch", pageId: patchTarget.pageId, patch }
            )
          }
          onDelete={(patchId) => dispatch({ type: "removePatch", pageId: patchTarget.pageId, patchId })}
          onClose={() => setPatchTarget(null)}
        />
      )}
    </aside>
  );
}

/* ---------- controles granulares de documento propio ---------- */

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label className="section-label">{label}</label>
      <div
        className="mt-1 flex items-center gap-1.5 rounded border px-1.5 py-1"
        style={{ background: "var(--input-bg)", borderColor: "var(--border)" }}
      >
        <input
          type="color"
          className="h-6 w-7 shrink-0 cursor-pointer border-0 bg-transparent p-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="truncate text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function DocStyleControls({
  doc,
  onPatch
}: {
  doc: SourceDoc;
  onPatch: (doc: SourceDoc, patch: Partial<DocStyle>) => void;
}) {
  const { dispatch } = useStation();
  const style = resolveStyle(doc);
  const font = fontById(style.fontId);

  return (
    <div className="flex flex-col gap-3">
      <p className="truncate text-[11px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }} title={doc.name}>
        {doc.name}
      </p>

      {/* Preset como punto de partida */}
      <div>
        <label className="section-label" htmlFor="doc-preset">
          Estilo base
        </label>
        <select
          id="doc-preset"
          className="btn-ghost mt-1 w-full"
          style={{ background: "var(--input-bg)" }}
          value={doc.preset}
          onChange={(e) =>
            dispatch({
              type: "updateDoc",
              docId: doc.id,
              patch: { preset: e.target.value, style: presetById(e.target.value).base }
            })
          }
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <ColorField label="Color fondo" value={style.bgColor} onChange={(v) => onPatch(doc, { bgColor: v })} />
        <ColorField label="Color letra" value={style.textColor} onChange={(v) => onPatch(doc, { textColor: v })} />
      </div>

      <div>
        <label className="section-label" htmlFor="doc-font">
          Tipografía activa
        </label>
        <select
          id="doc-font"
          className="btn-ghost mt-1 w-full"
          style={{ background: "var(--input-bg)" }}
          value={style.fontId}
          onChange={(e) => onPatch(doc, { fontId: e.target.value })}
        >
          {FONT_CHOICES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="section-label" htmlFor="doc-size">
            Tamaño (pt)
          </label>
          <input
            id="doc-size"
            type="number"
            min={6}
            max={24}
            step={0.5}
            className="mt-1 w-full rounded border px-2 py-1 text-[12px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            value={style.fontSizePt}
            onChange={(e) => onPatch(doc, { fontSizePt: Number(e.target.value) || 9.5 })}
          />
        </div>
        <div className="flex-1">
          <label className="section-label" htmlFor="doc-lh">
            Interlineado
          </label>
          <input
            id="doc-lh"
            type="number"
            min={1}
            max={2.5}
            step={0.05}
            className="mt-1 w-full rounded border px-2 py-1 text-[12px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            value={style.lineHeight}
            onChange={(e) => onPatch(doc, { lineHeight: Number(e.target.value) || 1.4 })}
          />
        </div>
      </div>

      {/* Papel de muestra — preview en vivo del estilo */}
      <div>
        <div className="section-label mb-1">Papel de muestra</div>
        <div
          className="rounded-md border px-3 py-4"
          style={{
            borderColor: "var(--border-strong)",
            background: style.bgColor,
            color: style.textColor,
            fontFamily: font.stack,
            fontSize: `${style.fontSizePt * 1.33}px`,
            lineHeight: style.lineHeight
          }}
        >
          Texto de Prueba 1980s
        </div>
      </div>

      <div className="flex gap-2">
        <ColorField label="Fondo TH" value={style.thBg} onChange={(v) => onPatch(doc, { thBg: v })} />
        <ColorField label="Texto TH" value={style.thText} onChange={(v) => onPatch(doc, { thText: v })} />
      </div>

      <MyStylesBlock doc={doc} style={style} />

      <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Todo es CSS de compilación — el PDF sale 100% vectorial, nítido a cualquier zoom. Los
        cambios se aplican solos al documento maestro (recompila en segundo plano).
      </p>
    </div>
  );
}

/* ---------- Mis estilos: presets custom de Sandy (v1.6) ---------- */

function MyStylesBlock({ doc, style }: { doc: SourceDoc; style: DocStyle }) {
  const { dispatch } = useStation();
  const { styles, error, save, remove } = useMyStyles();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // Estilo elegido en el desplegable — habilita el ✕ de borrado contextual
  const [selectedId, setSelectedId] = useState("");

  function apply(s: CustomStylePreset) {
    // El doc recibe su COPIA de los valores + el preset de fábrica base (aporta su CSS
    // extra al compilar): borrar el estilo custom después jamás cambia este documento
    dispatch({
      type: "updateDoc",
      docId: doc.id,
      patch: { preset: s.baseId, style: { ...s.style } }
    });
  }

  // Elegir en el desplegable = aplicar al documento
  function choose(id: string) {
    setSelectedId(id);
    const s = styles.find((x) => x.id === id);
    if (s) apply(s);
  }

  function handleDelete() {
    const s = styles.find((x) => x.id === selectedId);
    if (!s) return;
    if (window.confirm(`¿Borrar el estilo "${s.label}"? Los documentos que lo usan no cambian.`)) {
      remove(s.id);
      setSelectedId("");
    }
  }

  function handleSave() {
    if (!name.trim()) return;
    save(name, doc.preset, style);
    setName("");
    setNaming(false);
  }

  return (
    <div>
      <div className="section-label mb-1">Mis estilos</div>

      {styles.length > 0 && (
        <div className="flex items-center gap-1.5">
          {/* Desplegable: elegir = aplicar. Una sola línea aunque tengas muchos estilos. */}
          <select
            className="btn-ghost min-w-0 flex-1"
            style={{ background: "var(--input-bg)" }}
            value={selectedId}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Aplicar un estilo…</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {selectedId && styles.some((s) => s.id === selectedId) && (
            <button
              className="shrink-0 rounded px-1 text-[12px]"
              style={{ color: "var(--danger)" }}
              title="Borrar el estilo elegido (tus documentos no cambian)"
              onClick={handleDelete}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {naming ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border px-2 py-1 text-[12px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            placeholder="Nombre del estilo…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setNaming(false);
            }}
          />
          <button className="btn-ghost shrink-0" disabled={!name.trim()} onClick={handleSave}>
            ✓
          </button>
        </div>
      ) : (
        <button
          className="btn-ghost mt-1.5 w-full"
          title="Guardar la combinación actual (fuente, colores, tabla) con nombre — queda disponible en todos tus proyectos"
          onClick={() => setNaming(true)}
        >
          ＋ Guardar estilo actual…
        </button>
      )}

      {styles.length === 0 && !naming && (
        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Guarda tus combinaciones ganadoras con nombre y reúsalas en cualquier proyecto.
        </p>
      )}

      {error && (
        <p className="mt-1.5 text-[10px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
