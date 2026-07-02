import { useEffect, useState } from "react";
import { DocEditor } from "./components/DocEditor";
import { Inspector } from "./components/Inspector";
import { Organizer } from "./components/Organizer";
import { Sidebar } from "./components/Sidebar";
import { exportProject } from "./engine/exportProject";
import { deserialize, serialize } from "./engine/projectFile";
import { evictBytes } from "./engine/bytesCache";
import { evictSource } from "./engine/thumbnails";
import { useStation } from "./state/store";
import { bytesToB64 } from "../../shared/b64";

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
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const { project, dispatch } = useStation();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  function showToast(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
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

  // Título de ventana = nombre del proyecto
  useEffect(() => {
    document.title = `${project.name} — sanblueᵈᵒᵗ pdf-station`;
  }, [project.name]);

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
    const hasWork = project.pages.length > 0 || project.docs.length > 0 || project.pdfs.length > 0;
    if (hasWork && !window.confirm("¿Empezar de cero? Se descartará lo que no hayas guardado.")) return;
    clearCaches();
    dispatch({ type: "newProject" });
    setCurrentPath(null);
    setEditingDocId(null);
  }

  async function handleSaveProject(saveAs = false) {
    try {
      const savedPath = await window.station.saveProjectDialog(
        serialize(project),
        saveAs ? null : currentPath,
        project.name
      );
      if (savedPath) {
        setCurrentPath(savedPath);
        showToast("ok", "Proyecto guardado.");
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Error al guardar el proyecto.");
    }
  }

  async function handleOpenProject() {
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
        className="flex h-[52px] shrink-0 items-center justify-between border-b px-5"
        style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="brand text-[15px]">
            sanblue<sup>dot</sup>
          </span>
          <span className="section-label">retro pdf-station</span>
          <div className="ml-3 flex gap-1.5">
            <button className="btn-ghost" onClick={handleNew} title="Proyecto nuevo (empezar de cero)">
              Nuevo
            </button>
            <button className="btn-ghost" onClick={handleOpenProject} title="Abrir proyecto .sbstation (Cmd+O)">
              Abrir proyecto
            </button>
            <button className="btn-ghost" onClick={() => handleSaveProject(false)} title="Guardar proyecto (Cmd+S)">
              Guardar
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }}
            disabled={exporting || project.pages.length === 0}
            onClick={handleExport}
            title="Fusionar todo el documento en un PDF vectorial"
          >
            {exporting ? "Exportando…" : "⚡ EXPORTAR PDF"}
          </button>
          <button
            className="btn-ghost"
            style={showLeft ? { borderColor: "var(--accent)" } : undefined}
            onClick={() => setShowLeft((v) => !v)}
            title="Mostrar/ocultar FUENTES"
          >
            ◧
          </button>
          <button
            className="btn-ghost"
            style={showRight ? { borderColor: "var(--accent)" } : undefined}
            onClick={() => setShowRight((v) => !v)}
            title="Mostrar/ocultar ESTÉTICA"
          >
            ◨
          </button>
          <button className="btn-ghost" onClick={toggle} title="Cambiar tema">
            {dark ? "◑ oscuro" : "◐ claro"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {showLeft && <Sidebar onOpenDoc={setEditingDocId} />}

        {/* Guard: si el doc abierto ya no existe (eliminado / proyecto nuevo), volver al organizador */}
        {editingDocId && project.docs.some((d) => d.id === editingDocId) ? (
          <DocEditor docId={editingDocId} onClose={() => setEditingDocId(null)} />
        ) : (
          <Organizer />
        )}

        {showRight && <Inspector />}
      </main>

      {toast && (
        <div
          className="fixed right-4 bottom-4 z-50 max-w-[360px] rounded-lg border px-4 py-3 text-[12px]"
          style={{
            fontFamily: "var(--mono)",
            background: "var(--panel-bg)",
            color: toast.kind === "error" ? "var(--danger)" : "var(--text)",
            borderColor: toast.kind === "error" ? "var(--danger)" : "var(--accent)",
            boxShadow: "var(--shadow-lg)"
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
