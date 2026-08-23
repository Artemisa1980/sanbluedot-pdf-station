import { useEffect, useMemo, useRef, useState } from "react";
import { useStation } from "../state/store";
import { compileDoc, compileDocRaw } from "../engine/compile";
import { exportProject } from "../engine/exportProject";
import { resolveStyle } from "../engine/presets";
import { evictBytes } from "../engine/bytesCache";
import { evictSource, getPageCount, renderPageDataUrl } from "../engine/thumbnails";
import { b64ToBytes, bytesToB64 } from "../../../shared/b64";
import type { PageRef, StationProject } from "../../../shared/types";

export type EditorView = "editor" | "ambos" | "preview";

interface Props {
  docId: string;
  view: EditorView;
  onViewChange: (v: EditorView) => void;
  onClose: () => void;
}

/**
 * Editor de contenido propio. La maqueta ES el PDF real: se compila sola tras una
 * pausa de tecleo y se muestra como hojas separadas — cortes de página, numeración
 * y colores idénticos al PDF final. El texto se sincroniza al proyecto en cada edición;
 * solo la maqueta PDF usa debounce porque compilar es la operación costosa.
 */
export function DocEditor({ docId, view, onViewChange, onClose }: Props) {
  const { project, dispatch } = useStation();
  const doc = project.docs.find((d) => d.id === docId);

  const [content, setContent] = useState(doc?.content ?? "");
  const [previewB64, setPreviewB64] = useState<string | null>(doc?.compiledB64 ?? null);
  const [building, setBuilding] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);
  const [exportFlash, setExportFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const buildToken = useRef(0);

  const previewSrcId = `preview:${docId}`;
  const style = doc ? resolveStyle(doc) : null;

  // Maqueta viva: compilar el PDF real tras 1s de pausa (contenido, estilo o página del proyecto)
  useEffect(() => {
    if (!doc) return;
    const token = ++buildToken.current;
    const t = setTimeout(
      async () => {
        setBuilding(true);
        try {
          const b64 = await compileDocRaw({ ...doc, content }, project);
          if (buildToken.current !== token) return; // llegó tarde — hay una compilación más nueva
          evictSource(previewSrcId);
          evictBytes(previewSrcId);
          setPreviewB64(b64);
          setError(null);
        } catch (e) {
          if (buildToken.current === token) {
            setError(e instanceof Error ? e.message : "Error al maquetar.");
          }
        } finally {
          if (buildToken.current === token) setBuilding(false);
        }
      },
      previewB64 ? 1000 : 150 // primera maqueta casi inmediata; luego, pausa de tecleo
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.preset, doc?.style, content, project.pageSize, project.margins]);

  // Limpieza de la maqueta efímera al desmontar
  useEffect(() => {
    return () => {
      evictSource(`preview:${docId}`);
      evictBytes(`preview:${docId}`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (!doc) return null;

  function saveContent() {
    if (doc && content !== doc.content) {
      dispatch({ type: "updateDoc", docId, patch: { content } });
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function updateContent(next: string) {
    setContent(next);
    dispatch({ type: "updateDoc", docId, patch: { content: next } });
  }

  async function handleCompile() {
    if (!doc) return;
    dispatch({ type: "updateDoc", docId, patch: { content } });
    setCompiling(true);
    setError(null);
    try {
      const { compiledB64, previousPageCount, pageCount } = await compileDoc({ ...doc, content }, project);
      dispatch({ type: "setDocPages", docId, compiledB64, previousPageCount, pageCount });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido al compilar.");
    } finally {
      setCompiling(false);
    }
  }

  /** Insertar imágenes como <img> con URL file:// canónica (las relativas se rompen al compilar). */
  async function handleInsertImages() {
    const imgs = await window.station.pickImagesDialog();
    if (imgs.length === 0) return;
    const snippet = imgs
      .map(
        (im) =>
          `<img src="${im.url}" alt="${im.name.replace(/\.[^.]+$/, "").replace(/"/g, "")}" style="width:100%;border-radius:6px;" />`
      )
      .join("\n\n");
    const ta = textareaRef.current;
    const next = (() => {
      if (!ta) return content ? `${content.replace(/\n*$/, "")}\n\n${snippet}\n` : `${snippet}\n`;
      const start = ta.selectionStart ?? content.length;
      const end = ta.selectionEnd ?? start;
      const before = content.slice(0, start);
      const after = content.slice(end);
      const pad = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      return `${before}${pad}${snippet}\n\n${after}`;
    })();
    updateContent(next);
    ta?.focus();
  }

  /** Convertir SOLO este documento a PDF — no toca el proyecto (caso "md → pdf y ya"). */
  async function handleExportDoc() {
    if (!doc) return;
    setExportingDoc(true);
    setError(null);
    try {
      const current = { ...doc, content };
      const { compiledB64, pageCount } = await compileDoc(current, project);
      const pages: PageRef[] = Array.from({ length: pageCount }, (_, i) => ({
        id: `doc-export:${docId}:${i}`,
        srcId: docId,
        srcKind: "doc",
        pageIndex: i,
        rotation: 0,
        background: null,
        patches: []
      }));
      // Mismo motor que EXPORTAR: papel de color de borde a borde, todo vectorial
      const single: StationProject = {
        ...project,
        docs: [{ ...current, compiledB64 }],
        pdfs: [],
        pages
      };
      const bytes = await exportProject(single);
      const base = doc.name.replace(/\.(md|markdown|html?|htm)$/i, "");
      const saved = await window.station.exportPdfDialog(`${base || "documento"}.pdf`, bytesToB64(bytes));
      if (saved) {
        setExportFlash(true);
        setTimeout(() => setExportFlash(false), 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar el documento.");
    } finally {
      setExportingDoc(false);
    }
  }

  const editorArea = (framed: boolean) => (
    <textarea
      ref={textareaRef}
      className={`h-full w-full resize-none text-[13px] leading-relaxed outline-none ${framed ? "px-7 py-6" : "p-6"}`}
      style={{
        fontFamily: "var(--mono)",
        background: framed ? "transparent" : "var(--panel-bg)",
        color: "var(--text)"
      }}
      value={content}
      onChange={(e) => updateContent(e.target.value)}
      spellCheck={false}
      placeholder={doc.kind === "md" ? "# Escribe tu Markdown aquí…" : "<h1>Escribe tu HTML aquí…</h1>"}
    />
  );

  const sheets = (
    <PreviewSheets
      srcId={previewSrcId}
      b64={previewB64}
      paperColor={style && style.bgColor.toLowerCase() !== "#ffffff" ? style.bgColor : null}
      pageRatio={project.pageSize === "a4" ? "210 / 297" : "17 / 22"}
    />
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Barra del editor — flex-wrap: en ventanas angostas los controles bajan de línea sin romperse */}
      <div
        className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5"
        style={{ background: "var(--panel-header)", borderColor: "var(--border)" }}
      >
        <button className="btn-ghost" onClick={onClose}>
          ‹ Volver
        </button>

        {/* Modo de vista: solo editor / ambos / solo maqueta */}
        <div className="flex gap-0.5">
          {(
            [
              ["editor", "✎", "Solo editor"],
              ["ambos", "◫", "Ambos (maqueta + fuente)"],
              ["preview", "▤", "Solo documento"]
            ] as const
          ).map(([mode, icon, title]) => (
            <button
              key={mode}
              className="btn-ghost"
              style={view === mode ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
              title={title}
              onClick={() => onViewChange(mode)}
            >
              {icon}
            </button>
          ))}
        </div>

        <input
          className="min-w-0 flex-1 rounded border px-2 py-1 text-[13px]"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
          value={doc.name}
          onChange={(e) => dispatch({ type: "updateDoc", docId, patch: { name: e.target.value } })}
        />

        {building && (
          <span className="text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
            ◌ maquetando…
          </span>
        )}

        <button
          className="btn-ghost whitespace-nowrap"
          onClick={handleInsertImages}
          title="Insertar imágenes de tu compu — la ruta file:// segura se genera sola"
        >
          ＋ Imagen
        </button>

        <button
          className="btn-ghost tip whitespace-nowrap"
          style={exportFlash ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          disabled={exportingDoc}
          onClick={handleExportDoc}
          data-tip="Convertir SOLO este documento a PDF (no toca el proyecto)"
        >
          {exportingDoc ? "Exportando…" : exportFlash ? "✓ PDF" : "⬇ PDF"}
        </button>

        <button
          className="btn-ghost whitespace-nowrap"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }}
          disabled={compiling}
          onClick={handleCompile}
          title="Compilar al documento maestro (PDF vectorial)"
        >
          {compiling ? "Compilando…" : "⚡ Compilar"}
        </button>
      </div>

      {error && (
        <div
          className="px-4 py-2 text-[12px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)", fontFamily: "var(--mono)" }}
        >
          {error}
        </div>
      )}

      {/* Contenido según el modo de vista */}
      {view === "ambos" ? (
        /* Dos tarjetas independientes, cada una con su propio scroll */
        <div className="flex min-h-0 flex-1 gap-3 p-3" style={{ background: "var(--app-bg)" }}>
          <div className="card-retro flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex h-[38px] shrink-0 items-center justify-between border-b px-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
            >
              <span className="section-label">▤ Maqueta — PDF real</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--panel-header)" }}>
              {sheets}
            </div>
          </div>

          <div className="card-retro flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex h-[38px] shrink-0 items-center justify-between border-b px-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
            >
              <span className="section-label truncate">✎ Fuente: {doc.name}</span>
              <button
                className="btn-ghost"
                style={savedFlash ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                onClick={saveContent}
                title="Guardar el texto en el proyecto (también se guarda solo)"
              >
                {savedFlash ? "✓ Guardado" : "Guardar"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{editorArea(true)}</div>
          </div>
        </div>
      ) : view === "editor" ? (
        /* La fuente también es una hoja: tarjeta centrada con aire, no un textarea desnudo */
        <div className="min-h-0 flex-1 overflow-auto p-5" style={{ background: "var(--panel-header)" }}>
          <div className="card-retro mx-auto flex h-full w-full max-w-[900px] flex-col overflow-hidden">
            <div
              className="flex h-[38px] shrink-0 items-center justify-between border-b px-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
            >
              <span className="section-label truncate">✎ Fuente: {doc.name}</span>
              <button
                className="btn-ghost"
                style={savedFlash ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                onClick={saveContent}
                title="Guardar el texto en el proyecto (también se guarda solo)"
              >
                {savedFlash ? "✓ Guardado" : "Guardar"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{editorArea(true)}</div>
          </div>
        </div>
      ) : (
        /* Vista única: el documento como hojas, sin marcos */
        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--panel-header)" }}>
          {sheets}
        </div>
      )}
    </section>
  );
}

/* ---------- la maqueta: hojas del PDF compilado, con render perezoso ---------- */

function PreviewSheets({
  srcId,
  b64,
  paperColor,
  pageRatio
}: {
  srcId: string;
  b64: string | null;
  paperColor: string | null;
  pageRatio: string;
}) {
  const bytes = useMemo(() => (b64 ? b64ToBytes(b64) : null), [b64]);
  const [count, setCount] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);

  // Ancho de hoja = ancho disponible (se adapta al modo única/ambos y al panel)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.min(860, Math.floor(entry.contentRect.width - 56))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!bytes) {
      setCount(0);
      return;
    }
    getPageCount(srcId, bytes)
      .then((n) => alive && setCount(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [srcId, bytes]);

  return (
    <div ref={boxRef} className="min-h-full px-6 py-5">
      {!bytes ? (
        <p className="text-center text-[12px]" style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
          ◌ maquetando el documento…
        </p>
      ) : (
        <div className="mx-auto flex w-fit flex-col gap-5">
          {Array.from({ length: count }, (_, i) => (
            <div key={`${srcId}:${i}`}>
              <PreviewSheet
                srcId={srcId}
                bytes={bytes}
                pageIndex={i}
                width={width}
                paperColor={paperColor}
                pageRatio={pageRatio}
              />
              <div
                className="mt-1 text-center text-[10px]"
                style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}
              >
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewSheet({
  srcId,
  bytes,
  pageIndex,
  width,
  paperColor,
  pageRatio
}: {
  srcId: string;
  bytes: Uint8Array;
  pageIndex: number;
  width: number;
  paperColor: string | null;
  pageRatio: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    // Papel de color: render transparente + color debajo (idéntico a la capa de exportación)
    renderPageDataUrl(srcId, bytes, pageIndex, width, paperColor !== null)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [near, srcId, bytes, pageIndex, width, paperColor]);

  return (
    <div
      ref={ref}
      className="sheet overflow-hidden"
      style={{ width, aspectRatio: pageRatio, background: paperColor ?? "#ffffff" }}
    >
      {url && <img src={url} alt="" draggable={false} className="h-full w-full object-contain" />}
    </div>
  );
}
