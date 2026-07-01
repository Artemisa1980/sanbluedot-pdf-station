import { useEffect, useState } from "react";
import { useStation } from "../state/store";
import { buildDocHtml, compileDoc } from "../engine/compile";
import { PRESETS } from "../engine/presets";
import type { SignatureMode } from "../../../shared/types";

interface Props {
  docId: string;
  onClose: () => void;
}

/** Editor de contenido propio: fuente a la izquierda, preview compilada en vivo a la derecha. */
export function DocEditor({ docId, onClose }: Props) {
  const { project, dispatch } = useStation();
  const doc = project.docs.find((d) => d.id === docId);

  const [content, setContent] = useState(doc?.content ?? "");
  const [previewHtml, setPreviewHtml] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"editor" | "ambos" | "preview">("ambos");

  // Preview en vivo con debounce de 300ms
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => setPreviewHtml(buildDocHtml({ ...doc, content })), 300);
    return () => clearTimeout(t);
  }, [doc, content]);

  if (!doc) return null;

  function saveContent() {
    dispatch({ type: "updateDoc", docId, patch: { content } });
  }

  async function handleCompile() {
    if (!doc) return;
    saveContent();
    setCompiling(true);
    setError(null);
    try {
      const { compiledB64, pageCount } = await compileDoc({ ...doc, content }, project);
      dispatch({ type: "setDocPages", docId, compiledB64, pageCount });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido al compilar.");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Barra del editor */}
      <div
        className="flex h-[44px] shrink-0 items-center gap-2 border-b px-4"
        style={{ background: "var(--panel-header)", borderColor: "var(--border)" }}
      >
        <button
          className="btn-ghost"
          onClick={() => {
            saveContent();
            onClose();
          }}
        >
          ‹ Volver
        </button>

        {/* Modo de vista: solo editor / ambos / solo preview (patrón del workspace original) */}
        <div className="flex gap-0.5">
          {(
            [
              ["editor", "✎", "Solo editor"],
              ["ambos", "◫", "Ambos"],
              ["preview", "▤", "Solo preview"]
            ] as const
          ).map(([mode, icon, title]) => (
            <button
              key={mode}
              className="btn-ghost"
              style={view === mode ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
              title={title}
              onClick={() => setView(mode)}
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

        <select
          className="btn-ghost"
          style={{ background: "var(--input-bg)" }}
          value={doc.preset}
          onChange={(e) => dispatch({ type: "updateDoc", docId, patch: { preset: e.target.value } })}
          title="Preset estético"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          className="btn-ghost"
          style={{ background: "var(--input-bg)" }}
          value={doc.signature}
          onChange={(e) =>
            dispatch({ type: "updateDoc", docId, patch: { signature: e.target.value as SignatureMode } })
          }
          title="Firma sanblueᵈᵒᵗ"
        >
          <option value="academic">Firma académica</option>
          <option value="professional">Firma profesional</option>
          <option value="off">Sin firma</option>
        </select>

        {doc.signature === "academic" && (
          <input
            className="w-[220px] rounded border px-2 py-1 text-[12px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            placeholder="Materia · Semana X de Y · Tema"
            value={doc.academicLine}
            onChange={(e) => dispatch({ type: "updateDoc", docId, patch: { academicLine: e.target.value } })}
          />
        )}

        <button
          className="btn-ghost"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
          disabled={compiling}
          onClick={handleCompile}
        >
          {compiling ? "Compilando…" : "⚡ Compilar al documento"}
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

      {/* Editor + preview según el modo de vista */}
      <div className="flex min-h-0 flex-1">
        {view !== "preview" && (
          <textarea
            className={`h-full resize-none p-4 text-[13px] leading-relaxed outline-none ${
              view === "editor" ? "w-full" : "w-1/2 border-r"
            }`}
            style={{
              fontFamily: "var(--mono)",
              background: "var(--panel-bg)",
              color: "var(--text)",
              borderColor: "var(--border)"
            }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder={doc.kind === "md" ? "# Escribe tu Markdown aquí…" : "<h1>Escribe tu HTML aquí…</h1>"}
          />
        )}
        {view !== "editor" && (
          <iframe
            className={`h-full ${view === "preview" ? "w-full" : "w-1/2"}`}
            style={{ background: "#ffffff", border: "none" }}
            title="Previsualización compilada"
            sandbox=""
            srcDoc={previewHtml}
          />
        )}
      </div>
    </section>
  );
}
