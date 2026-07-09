import { useEffect, useState } from "react";
import { newId } from "./store";
import type { CustomStylePreset, DocStyle } from "../../../shared/types";

/**
 * "Mis estilos" (v1.6, pedido de Sandy): sus combinaciones ganadoras con nombre,
 * guardadas en la APP (userData) — aparecen en todos los proyectos, se borran una
 * a una cuando ya no las quiere. Escritura write-through: cada cambio persiste al
 * instante (son bytes de JSON, el peso jamás será tema).
 */
export function useMyStyles() {
  const [styles, setStyles] = useState<CustomStylePreset[]>([]);

  useEffect(() => {
    window.station
      .myStylesRead()
      .then(setStyles)
      .catch(() => setStyles([]));
  }, []);

  function persist(next: CustomStylePreset[]): void {
    setStyles(next);
    void window.station.myStylesWrite(next);
  }

  /** Guarda la combinación actual; mismo nombre = reemplazar (actualizar sin duplicar). */
  function save(label: string, baseId: string, style: DocStyle): void {
    const clean = label.trim();
    if (!clean) return;
    const rest = styles.filter((s) => s.label.toLowerCase() !== clean.toLowerCase());
    persist([...rest, { id: newId(), label: clean, baseId, style: { ...style } }]);
  }

  function remove(id: string): void {
    persist(styles.filter((s) => s.id !== id));
  }

  return { styles, save, remove };
}
