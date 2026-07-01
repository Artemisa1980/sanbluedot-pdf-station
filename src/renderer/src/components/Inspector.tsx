import { useState } from "react";
import { useStation } from "../state/store";
import { sourceFor } from "../engine/sources";
import { PatchEditor } from "./PatchEditor";
import type { Patch } from "../../../shared/types";

const SWATCHES: Array<{ label: string; color: string }> = [
  { label: "Blanco", color: "#ffffff" },
  { label: "Crema", color: "#fbf9f3" },
  { label: "Sage", color: "#e4ebe6" },
  { label: "Navy", color: "#16213e" }
];

/** Panel ESTÉTICA: fondos de página para la selección y parches para la página activa. */
export function Inspector() {
  const { project, selection, dispatch } = useStation();
  const [patchTarget, setPatchTarget] = useState<{ pageId: string; patch: Patch | null } | null>(null);

  const single = selection.length === 1 ? project.pages.find((p) => p.id === selection[0]) ?? null : null;
  const singleSrc = single ? sourceFor(project, single) : null;

  return (
    <aside
      className="flex w-[300px] shrink-0 flex-col overflow-auto border-l p-4"
      style={{ background: "var(--panel-bg)", borderColor: "var(--border)" }}
    >
      <div className="section-label mb-3">Estética</div>

      {selection.length === 0 ? (
        <div className="flex flex-col gap-2">
          <label className="section-label">Nombre del proyecto</label>
          <input
            className="rounded border px-2 py-1.5 text-[13px]"
            style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--text)" }}
            value={project.name}
            onChange={(e) => dispatch({ type: "setName", value: e.target.value })}
          />
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {project.pages.length} páginas · {project.pdfs.length} PDF · {project.docs.length} doc
          </p>
          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Selecciona páginas en el organizador para pintarles fondo o ponerles parches.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* FONDO */}
          <div>
            <div className="section-label mb-2">
              Fondo de página · {selection.length} pág
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((s) => (
                <button
                  key={s.color}
                  className="h-8 w-8 rounded-md border-2 transition-transform hover:scale-110"
                  style={{ background: s.color, borderColor: "var(--border)" }}
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
              El fondo se inyecta como capa vectorial debajo del contenido original — nitidez intacta.
            </p>
          </div>

          {/* PARCHES — solo con exactamente 1 página seleccionada */}
          {single && (
            <div>
              <div className="section-label mb-2">Parches · pág {project.pages.indexOf(single) + 1}</div>
              {single.patches.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Sin parches en esta página.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {single.patches.map((patch, i) => (
                    <li key={patch.id}>
                      <button
                        className="btn-ghost flex w-full items-center gap-2 text-left"
                        onClick={() => setPatchTarget({ pageId: single.id, patch })}
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
                onClick={() => setPatchTarget({ pageId: single.id, patch: null })}
              >
                ＋ Parche
              </button>
            </div>
          )}
          {selection.length > 1 && (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Para parches, selecciona una sola página.
            </p>
          )}
        </div>
      )}

      {patchTarget && single && singleSrc && (
        <PatchEditor
          page={single}
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
