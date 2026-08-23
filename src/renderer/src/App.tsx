import { useEffect, useRef, useState } from "react";
import { DocEditor, type EditorView } from "./components/DocEditor";
import { LeftPanel } from "./components/LeftPanel";
import { Organizer } from "./components/Organizer";
import { exportProject } from "./engine/exportProject";
import { deserialize, serialize } from "./engine/projectFile";
import { evictBytes } from "./engine/bytesCache";
import { evictSource } from "./engine/thumbnails";
import { useStation } from "./state/store";
import { useAutoRecompile } from "./state/useAutoRecompile";
import { useDraftAutosave } from "./state/useDraftAutosave";
import { bytesToB64 } from "../../shared/b64";
import badgeUrl from "./assets/sanblue-badge.png";

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("station-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("station-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export default function App() {
  const { dark, toggle } = useTheme();
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editorView, setEditorView] = useState<EditorView>("ambos");
  const [readerAt, setReaderAt] = useState<string | null>(null); // abrir lectura en esta página
  const [showPanel, setShowPanel] = useState(true);
  const { project, dirty, dispatch } = useStation();
  const projectRef = useRef(project);
  projectRef.current = project;
  const saveInFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  // Estilos vivos: recompila solo los docs cuyo estilo cambió, en cualquier vista
  const recompiling = useAutoRecompile((msg) => showToast("error", msg));
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  // false hasta resolver el prompt de restauración — si el autosave arrancara antes,
  // borraría el borrador que estamos por ofrecer (dirty nace en false)
  const [draftReady, setDraftReady] = useState(false);

  function showToast(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  }

  // Borrador de recuperación: si existe al arrancar, la app murió con trabajo sin guardar
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const draft = await window.station.draftRead();
        if (!cancelled && draft) {
          const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "";
          const restore = window.confirm(
            `Hay un borrador de recuperación de "${draft.name}"${when ? ` (${when})` : ""} — la app se cerró sin guardar.\n\nAceptar = restaurarlo · Cancelar = descartarlo (se borra).`
          );
          if (restore) {
            const project = deserialize(draft.json);
            dispatch({ type: "loadProject", project, dirty: true });
            setCurrentPath(draft.filePath);
            showToast("ok", `Borrador restaurado: "${project.name}" — asiéntalo con Cmd+S.`);
          } else {
            await window.station.draftClear();
          }
        }
      } catch (e) {
        showToast(
          "error",
          e instanceof Error ? e.message : "No se pudo leer el borrador de recuperación."
        );
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: borrador rotativo en userData mientras haya cambios sin guardar
  useDraftAutosave(project, dirty, currentPath, draftReady);

  function openDoc(docId: string, view: EditorView = "preview") {
    setEditorView(view);
    setEditingDocId(docId);
  }

  // Click en un PDF de la cola: cerrar el editor si hace falta y abrir la lectura ahí
  function openReaderAt(pageId: string) {
    setEditingDocId(null);
    setReaderAt(pageId);
  }

  // Red de seguridad: ningún error de runtime vuelve a fallar en silencio
  useEffect(() => {
    function onError(e: ErrorEvent) {
      showToast("error", `Error interno: ${e.message}`);
    }
    function onRejection(e: PromiseRejectionEvent) {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      showToast("error", `Error interno: ${msg}`);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Atajos de proyecto: Cmd/Ctrl+S guardar · Shift+Cmd/Ctrl+S guardar como · Cmd/Ctrl+O abrir
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void handleSaveProject(e.shiftKey);
      } else if (k === "o") {
        e.preventDefault();
        void handleOpenProject();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Título de ventana = nombre del proyecto (• = cambios sin guardar)
  useEffect(() => {
    document.title = `${dirty ? "• " : ""}${project.name} — sanblueᵈᵒᵗ pdf-station`;
  }, [project.name, dirty]);

  // El main necesita saber si hay cambios sin guardar (aviso al cerrar la ventana)
  useEffect(() => {
    window.station.setDirty(dirty);
  }, [dirty]);

  function clearCaches() {
    for (const p of project.pdfs) {
      evictSource(p.id);
      evictBytes(p.id);
    }
    for (const d of project.docs) {
      evictSource(d.id);
      evictBytes(d.id);
    }
  }

  function handleNew() {
    if (saveInFlight.current) {
      showToast("error", "Espera a que termine el guardado actual.");
      return;
    }
    if (dirty && !window.confirm("¿Empezar de cero? Se descartará lo que no hayas guardado.")) return;
    clearCaches();
    dispatch({ type: "newProject" });
    setCurrentPath(null);
    setEditingDocId(null);
  }

  async function handleSaveProject(saveAs = false) {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    const snapshot = projectRef.current;
    try {
      const savedPath = await window.station.saveProjectDialog(
        serialize(snapshot),
        saveAs ? null : currentPath,
        snapshot.name
      );
      if (savedPath) {
        setCurrentPath(savedPath);
        if (projectRef.current === snapshot) {
          dispatch({ type: "markSaved" });
          showToast("ok", "Proyecto guardado.");
        } else {
          showToast("ok", "Versión guardada; hay cambios posteriores pendientes.");
        }
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Error al guardar el proyecto.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function handleOpenProject() {
    if (saveInFlight.current) {
      showToast("error", "Espera a que termine el guardado actual.");
      return;
    }
    // Protección de trabajo: abrir encima descarta el proyecto actual
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto y descartarlos?")) return;
    try {
      const res = await window.station.openProjectDialog();
      if (!res) return;
      const loaded = deserialize(res.json);
      clearCaches();
      dispatch({ type: "loadProject", project: loaded });
      setCurrentPath(res.path);
      setEditingDocId(null);
      showToast(
        "ok",
        `Proyecto "${loaded.name}" abierto — ${loaded.pages.length} páginas · ${loaded.pdfs.length} PDF · ${loaded.docs.length} doc.`
      );
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Error al abrir el proyecto.");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const bytes = await exportProject(project);
      const saved = await window.station.exportPdfDialog(`${project.name}.pdf`, bytesToB64(bytes));
      if (saved) showToast("ok", "PDF exportado — vectorial, nítido, tuyo.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Error al exportar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        className="flex h-[52px] shrink-0 items-center justify-between border-b px-4"
        style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src={badgeUrl}
            alt=""
            className="h-10 w-10 shrink-0 select-none"
            draggable={false}
          />
          <span className="brand text-[15px]">
            sanblue<sup>dot</sup>
          </span>
          {/* Un click abre, un click cierra — todo vive en el panel izquierdo */}
          <button
            className="btn-ghost"
            onClick={() => setShowPanel((v) => !v)}
            title={showPanel ? "Cerrar panel" : "Abrir panel"}
          >
            {showPanel ? "‹" : "›"}
          </button>
          <span className="section-label hidden md:inline">retro pdf-station</span>
          <div className="ml-2 flex gap-1.5">
            <button className="btn-ghost" onClick={handleNew} title="Proyecto nuevo (empezar de cero)">
              Nuevo
            </button>
            <button className="btn-ghost" onClick={handleOpenProject} title="Abrir proyecto .sbstation (Cmd+O)">
              Abrir
            </button>
            <button
              className="btn-ghost"
              disabled={saving}
              onClick={() => handleSaveProject(false)}
              title="Guardar proyecto (Cmd+S)"
            >
              {saving ? "Guardando…" : `Guardar${dirty ? " •" : ""}`}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="btn-ghost"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }}
            disabled={exporting || project.pages.length === 0 || recompiling.size > 0}
            onClick={handleExport}
            title={
              recompiling.size > 0
                ? "Aplicando el estilo nuevo… un momento"
                : "Fusionar todo el documento en un PDF vectorial"
            }
          >
            {exporting ? "Exportando…" : recompiling.size > 0 ? "◌ Aplicando estilo…" : "⚡ EXPORTAR PDF"}
          </button>
          <button className="btn-ghost" onClick={toggle} title="Cambiar tema">
            {dark ? "◑" : "◐"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {showPanel && (
          <LeftPanel
            editingDocId={editingDocId}
            onOpenDoc={openDoc}
            onOpenPdf={openReaderAt}
            recompiling={recompiling}
          />
        )}

        {/* Guard: si el doc abierto ya no existe (eliminado / proyecto nuevo), volver al organizador */}
        {editingDocId && project.docs.some((d) => d.id === editingDocId) ? (
          <DocEditor
            key={editingDocId} /* remonta al cambiar de doc — el texto local no se cruza */
            docId={editingDocId}
            view={editorView}
            onViewChange={setEditorView}
            onClose={() => setEditingDocId(null)}
          />
        ) : (
          <Organizer openAt={readerAt} onOpenConsumed={() => setReaderAt(null)} />
        )}
      </main>

      {toast && (
        <div
          className="card-retro fixed right-4 bottom-4 z-50 max-w-[360px] px-4 py-3 text-[12px]"
          style={{
            fontFamily: "var(--mono)",
            color: toast.kind === "error" ? "var(--danger)" : "var(--text)",
            borderColor: toast.kind === "error" ? "var(--danger)" : "var(--accent)"
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
