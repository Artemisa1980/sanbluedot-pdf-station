import { useEffect, useState } from "react";
import { Modal } from "./Modal";

interface DraftInfo {
  name: string;
  savedAt: number;
  size: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Borradores de recuperación" (v1.6, pedido de Sandy): transparencia total — ver qué
 * guarda el autosave (nombre, fecha, peso) y borrarlo a mano. Normalmente está vacío:
 * el borrador se limpia solo al guardar o cerrar bien; aquí solo vive el superviviente
 * de un cierre feo.
 */
export function DraftsModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<DraftInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.station
      .draftInfo()
      .then((i) => {
        setInfo(i);
        setLoaded(true);
      })
      .catch(() => {
        setError("No se pudo leer el borrador de recuperación.");
        setLoaded(true);
      });
  }, []);

  async function handleDelete() {
    if (!window.confirm("¿Borrar el borrador de recuperación?")) return;
    try {
      await window.station.draftClear();
      setInfo(null);
      setError(null);
    } catch {
      setError("No se pudo borrar el borrador de recuperación.");
    }
  }

  return (
    <Modal
      labelledBy="drafts-title"
      onClose={onClose}
      panelClassName="card-retro w-[420px] max-w-full overflow-hidden"
      panelStyle={{ boxShadow: "5px 5px 0 var(--shadow-ink)" }}
    >
      <header
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--border)", background: "var(--panel-header)" }}
      >
        <div id="drafts-title" className="section-label">
          Borradores de recuperación
        </div>
        <button className="btn-ghost" onClick={onClose} aria-label="Cerrar" title="Cerrar">
          ✕
        </button>
      </header>
      <div className="p-5">
        {error && (
          <p role="alert" className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {!loaded || (error && !info) ? null : info ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{info.name}</div>
              <div
                className="mt-0.5 text-[10px]"
                style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}
              >
                {new Date(info.savedAt).toLocaleString()} · {fmtSize(info.size)}
              </div>
            </div>
            <button
              className="btn-ghost btn-danger shrink-0"
              onClick={handleDelete}
            >
              Borrar
            </button>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            No hay borradores. El autosave se limpia solo al guardar o cerrar bien — aquí
            aparecería únicamente el superviviente de un cierre inesperado.
          </p>
        )}
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Es UN solo archivo que se sobrescribe cada 15 s mientras trabajas con cambios sin
          guardar — nunca se acumula nada en tu máquina.
        </p>
      </div>
    </Modal>
  );
}
