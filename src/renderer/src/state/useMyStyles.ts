import { useEffect, useRef, useState } from "react";
import { newId } from "./store";
import { isDocStyle } from "../engine/projectFile";
import type { CustomStylePreset, DocStyle } from "../../../shared/types";

function isCustomStylePreset(value: unknown): value is CustomStylePreset {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.label === "string" && typeof s.baseId === "string" && isDocStyle(s.style);
}

/**
 * "Mis estilos" (v1.6, pedido de Sandy): sus combinaciones ganadoras con nombre,
 * guardadas en la APP (userData) — aparecen en todos los proyectos, se borran una
 * a una cuando ya no las quiere. Escritura write-through: cada cambio persiste al
 * instante (son bytes de JSON, el peso jamás será tema).
 */
export function useMyStyles() {
  const [styles, setStyles] = useState<CustomStylePreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Siempre la lista más reciente: dos guardados seguidos parten de ella, no de un render viejo
  const stylesRef = useRef<CustomStylePreset[]>([]);
  const writeVersion = useRef(0);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    window.station
      .myStylesRead()
      .then((saved) => {
        // Un my-styles.json dañado no debe colar un estilo inválido en un documento
        const valid = saved.filter(isCustomStylePreset);
        stylesRef.current = valid;
        setStyles(valid);
        setError(null);
      })
      .catch(() => {
        stylesRef.current = [];
        setStyles([]);
        setError("No se pudieron leer Mis estilos.");
      });
  }, []);

  function persist(next: CustomStylePreset[]): void {
    const previous = stylesRef.current;
    const version = ++writeVersion.current;
    stylesRef.current = next;
    setStyles(next);
    setError(null);
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(() => window.station.myStylesWrite(next))
      .catch(() => {
        if (writeVersion.current !== version) return;
        stylesRef.current = previous;
        setStyles(previous);
        setError("No se pudo guardar el cambio en Mis estilos.");
      });
  }

  /** Guarda la combinación actual; mismo nombre = reemplazar (actualizar sin duplicar). */
  function save(label: string, baseId: string, style: DocStyle): void {
    const clean = label.trim();
    if (!clean) return;
    const rest = stylesRef.current.filter((s) => s.label.toLowerCase() !== clean.toLowerCase());
    persist([...rest, { id: newId(), label: clean, baseId, style: { ...style } }]);
  }

  function remove(id: string): void {
    persist(stylesRef.current.filter((s) => s.id !== id));
  }

  return { styles, error, save, remove };
}
