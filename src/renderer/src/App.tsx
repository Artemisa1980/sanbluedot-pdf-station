import { useEffect, useRef, useState } from "react";
import { DocEditor, type EditorView } from "./components/DocEditor";
import { LeftPanel } from "./components/LeftPanel";
import { ModalProvider, useModalOpen } from "./components/Modal";
import { Organizer } from "./components/Organizer";
import { exportProject } from "./engine/exportProject";
import { deserialize, serialize } from "./engine/projectFile";
import { evictBytes } from "./engine/bytesCache";
import { evictSource } from "./engine/thumbnails";
import { useStation } from "./state/store";
import { useAutoRecompile } from "./state/useAutoRecompile";
import { useDraftAutosave } from "./state/useDraftAutosave";
import { bytesToB64 } from "../../shared/b64";
import { cleanErrorText } from "./engine/errorText";

declare const __APP_VERSION__: string;

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("station-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("station-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

/** El proveedor de modales va por encima de AppShell: los atajos de aquí leen si hay uno abierto. */
export default function App() {
  return (
    <ModalProvider>
      <AppShell />
    </ModalProvider>
  );
}

function AppShell() {
  const { dark, toggle } = useTheme();
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editorView, setEditorView] = useState<EditorView>("ambos");
  const [readerAt, setReaderAt] = useState<string | null>(null); // abrir lectura en esta página
  const [showPanel, setShowPanel] = useState(true);
  // Sube en cada Nuevo/Abrir/restaurar: remonta el panel izquierdo y vacía su cola de importación
  const [projectEpoch, setProjectEpoch] = useState(0);
  const projectEpochRef = useRef(projectEpoch);
  projectEpochRef.current = projectEpoch;
  const modalOpen = useModalOpen();
  const { project, dirty, dispatch } = useStation();
  const projectRef = useRef(project);
  projectRef.current = project;
  const saveInFlight = useRef(false);
  const exportInFlight = useRef(false); // Nuevo/Abrir limpian cachés: no mientras una exportación las usa
  const [saving, setSaving] = useState(false);
  // Estilos vivos: recompila solo los docs cuyo estilo cambió, en cualquier vista
  const recompiling = useAutoRecompile((msg) => showToast("error", msg));
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  // false hasta resolver el prompt de restauración — si el autosave arrancara antes,
  // borraría el borrador que estamos por ofrecer (dirty nace en false)
  const [draftReady, setDraftReady] = useState(false);

  // Un aviso nuevo reinicia el reloj: el temporizador del anterior ya no lo cierra antes de sus 5 s (solo los "ok" caducan)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg: cleanErrorText(msg) });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    // Los errores se quedan hasta que se cierran: 5 s no alcanzan para leerlos
    if (kind === "ok") toastTimer.current = setTimeout(() => setToast(null), 5000);
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
            let project;
            try {
              project = deserialize(draft.json);
            } catch (e) {
              // Un borrador dañado no se puede restaurar jamás: se borra o el aviso volvería en cada arranque
              await window.station.draftClear().catch(() => {});
              throw new Error(
                `El borrador de recuperación estaba dañado y se descartó${e instanceof Error ? `: ${e.message}` : "."}`
              );
            }
            dispatch({ type: "loadProject", project, dirty: true });
            setProjectEpoch((n) => n + 1);
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
      if (modalOpen || !draftReady) return; // con un diálogo abierto (o el prompt de borrador sin resolver), Cmd+S/O no actúan
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
    if (exportInFlight.current) {
      showToast("error", "Espera a que termine la exportación.");
      return;
    }
    if (dirty && !window.confirm("¿Empezar de cero? Se descartará lo que no hayas guardado.")) return;
    clearCaches();
    dispatch({ type: "newProject" });
    setProjectEpoch((n) => n + 1);
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
    if (exportInFlight.current) {
      showToast("error", "Espera a que termine la exportación.");
      return;
    }
    // Protección de trabajo: abrir encima descarta el proyecto actual
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto y descartarlos?")) return;
    try {
      const res = await window.station.openProjectDialog();
      if (!res) return;
      const loaded = deserialize(res.json);
      // Una exportación pudo empezar mientras el diálogo estaba abierto
      if (exportInFlight.current) {
        showToast("error", "Espera a que termine la exportación.");
        return;
      }
      clearCaches();
      dispatch({ type: "loadProject", project: loaded });
      setProjectEpoch((n) => n + 1);
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
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    setExporting(true);
    try {
      const bytes = await exportProject(project);
      const saved = await window.station.exportPdfDialog(`${project.name}.pdf`, bytesToB64(bytes));
      if (saved) showToast("ok", "PDF exportado — vectorial, nítido, tuyo.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Error al exportar.");
    } finally {
      exportInFlight.current = false;
      setExporting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* inert hasta resolver el prompt de borrador: lo editado antes se perdería al aceptar */}
      <header className="app-header" inert={!draftReady}>
        <div className="app-identity">
          <div className="app-identity-copy">
            <div className="app-identity-title">
              <span>SANDY.SYSDEV</span>
              <span className="app-version">v{__APP_VERSION__}</span>
            </div>
            <span className="brand app-wordmark">
              sanblue<sup>dot</sup>
            </span>
          </div>
        </div>

        {/* Un click abre, un click cierra — todo vive en el panel izquierdo */}
        <button
          className="btn-ghost header-secondary panel-toggle"
          onClick={() => setShowPanel((v) => !v)}
          title={showPanel ? "Cerrar panel" : "Abrir panel"}
          aria-label={showPanel ? "Cerrar panel izquierdo" : "Abrir panel izquierdo"}
          aria-expanded={showPanel}
        >
          {showPanel ? "‹" : "›"}
        </button>
        <span className="app-product-name">retro pdf-station</span>

        <div className="app-header-actions">
          <div className="project-actions">
            <button className="btn-ghost header-secondary" onClick={handleNew} title="Proyecto nuevo (empezar de cero)">
              Nuevo
            </button>
            <button className="btn-ghost header-secondary" onClick={handleOpenProject} title="Abrir proyecto .sbstation (Cmd+O)">
              Abrir
            </button>
            <button
              className="btn-ghost header-secondary"
              disabled={saving}
              onClick={() => handleSaveProject(false)}
              title="Guardar proyecto (Cmd+S)"
            >
              {saving ? "Guardando…" : `Guardar${dirty ? " •" : ""}`}
            </button>
          </div>
          <span className="header-action-separator" aria-hidden="true" />
          <button
            className="btn-ghost export-button"
            disabled={exporting || project.pages.length === 0 || recompiling.busy.size > 0 || recompiling.stale.size > 0}
            onClick={handleExport}
            title={
              recompiling.busy.size > 0
                ? "Actualizando el documento… un momento"
                : recompiling.stale.size > 0
                  ? "Un documento no se pudo actualizar: ábrelo y dale ⚡ Compilar"
                  : "Fusionar todo el documento en un PDF vectorial"
            }
          >
            {exporting
              ? "Exportando…"
              : recompiling.busy.size > 0
                ? "◌ Actualizando…"
                : recompiling.stale.size > 0
                  ? "⚠ Documento sin actualizar"
                  : "⚡ EXPORTAR PDF"}
          </button>
          <button
            className="btn-ghost header-secondary"
            onClick={toggle}
            title="Cambiar tema"
            aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          >
            {dark ? "◑" : "◐"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1" inert={!draftReady} aria-busy={!draftReady}>
        {showPanel && (
          <LeftPanel
            key={projectEpoch}
            projectEpoch={projectEpoch}
            currentProjectEpoch={() => projectEpochRef.current}
            editingDocId={editingDocId}
            onOpenDoc={openDoc}
            onOpenPdf={openReaderAt}
            onError={(msg) => showToast("error", msg)}
            recompiling={recompiling.busy}
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

      <footer className="app-footer">
        <span>
          <strong>sanblue<sup>dot</sup></strong> — retro dev-station
        </span>
      </footer>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          className="card-retro fixed right-4 bottom-14 z-50 flex max-w-[360px] items-start gap-3 px-4 py-3 text-[12px]"
          style={{
            fontFamily: "var(--mono)",
            color: toast.kind === "error" ? "var(--danger)" : "var(--text)",
            borderColor: toast.kind === "error" ? "var(--danger)" : "var(--accent)"
          }}
        >
          <span className="min-w-0 flex-1">{toast.msg}</span>
          {toast.kind === "error" && (
            <button
              className="shrink-0 rounded px-1 text-[12px]"
              aria-label="Cerrar aviso de error"
              title="Cerrar"
              onClick={() => setToast(null)}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
