import { useEffect, useRef } from "react";
import { serialize } from "../engine/projectFile";
import type { StationProject } from "../../../shared/types";

/**
 * Autosave de recuperación (v1.6, diseño de Sandy): UN borrador rotativo en userData
 * que se sobrescribe mientras haya cambios sin guardar y se borra solo cuando el
 * trabajo queda a salvo (Cmd+S) o Sandy descarta conscientemente (Nuevo / Abrir /
 * cerrar sin guardar). Solo sobrevive a muertes que ella NO eligió: crash, apagón,
 * reinicio del watch. Nunca acumula archivos: es siempre el mismo.
 *
 * `enabled` llega en false hasta que App resuelve el prompt de restauración del
 * arranque — si no, este hook borraría el borrador que estamos por ofrecer
 * (dirty nace en false).
 */
const AUTOSAVE_MS = 15_000;

export function useDraftAutosave(
  project: StationProject,
  dirty: boolean,
  currentPath: string | null,
  enabled: boolean
): void {
  // El intervalo lee SIEMPRE el estado vivo vía ref — sin recrear timers por tecleo
  const stateRef = useRef({ project, dirty, currentPath });
  stateRef.current = { project, dirty, currentPath };
  const lastWritten = useRef<StationProject | null>(null);
  const prevDirty = useRef(false);

  // dirty true→false = el trabajo quedó a salvo o fue descartado a propósito → limpiar
  useEffect(() => {
    if (!enabled) return;
    if (prevDirty.current && !dirty) {
      lastWritten.current = null;
      void window.station.draftClear();
    }
    prevDirty.current = dirty;
  }, [dirty, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const s = stateRef.current;
      // Escribe solo con cambios sin guardar Y si el proyecto cambió desde la última vez
      if (!s.dirty || lastWritten.current === s.project) return;
      lastWritten.current = s.project;
      window.station
        .draftWrite(serialize(s.project), { name: s.project.name, filePath: s.currentPath })
        .catch(() => {
          lastWritten.current = null; // falló → reintenta en el próximo tick
        });
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
