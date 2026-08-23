import { useEffect, useRef, useState } from "react";
import { useStation } from "./store";
import { compileDoc } from "../engine/compile";
import { resolveStyle } from "../engine/presets";

/**
 * Vigilante de estilos: el Control Estético despacha el estilo nuevo al proyecto,
 * pero la compilación vivía solo en el editor (⚡) — fuera de él, el fondo nuevo se
 * pintaba bajo el PDF viejo y el contenido opaco se sobreponía (fallas F1/F2,
 * 2026-07-02). Este hook recompila solo, con pausa, cualquier doc YA compilado cuyo
 * estilo — o el tamaño/márgenes del proyecto — cambie, en cualquier vista. También
 * protege EXPORTAR: sin esto, exportar tras un cambio de estilo mezclaba fondo
 * nuevo + contenido viejo en el PDF final.
 *
 * Devuelve los ids de docs "ocupados" (esperando la pausa o compilando) para que la
 * UI lo muestre y el export espere.
 */
const DEBOUNCE_MS = 700;

export function useAutoRecompile(onError: (msg: string) => void): Set<string> {
  const { project, dispatch } = useStation();
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  // Firma por doc de todo lo que cambia el PDF sin tocar el contenido
  const sigs = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const tokens = useRef(new Map<string, number>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  function clearBusy(docId: string) {
    setBusy((prev) => {
      if (!prev.has(docId)) return prev;
      const next = new Set(prev);
      next.delete(docId);
      return next;
    });
  }

  function schedule(docId: string) {
    const pending = timers.current.get(docId);
    if (pending !== undefined) clearTimeout(pending);
    // Invalida también la compilación en vuelo: su resultado ya nació viejo
    tokens.current.set(docId, (tokens.current.get(docId) ?? 0) + 1);
    setBusy((prev) => (prev.has(docId) ? prev : new Set(prev).add(docId)));
    timers.current.set(
      docId,
      setTimeout(() => {
        timers.current.delete(docId);
        void run(docId);
      }, DEBOUNCE_MS)
    );
  }

  async function run(docId: string) {
    const token = (tokens.current.get(docId) ?? 0) + 1;
    tokens.current.set(docId, token);
    const proj = projectRef.current;
    const doc = proj.docs.find((d) => d.id === docId);
    if (!doc) {
      clearBusy(docId);
      return;
    }
    try {
      const { compiledB64, previousPageCount, pageCount } = await compileDoc(doc, proj);
      if (tokens.current.get(docId) !== token) return; // llegó tarde — hay una más nueva
      dispatch({ type: "setDocPages", docId, compiledB64, previousPageCount, pageCount });
    } catch (e) {
      if (tokens.current.get(docId) === token) {
        onErrorRef.current(
          e instanceof Error ? e.message : "Error al aplicar el estilo del documento."
        );
      }
    } finally {
      // Solo la corrida vigente libera el estado; si ya hay otra pausa en marcha, sigue ocupado
      if (tokens.current.get(docId) === token && !timers.current.has(docId)) {
        clearBusy(docId);
      }
    }
  }

  useEffect(() => {
    const seen = new Set<string>();
    for (const doc of project.docs) {
      seen.add(doc.id);
      const sig = JSON.stringify([
        resolveStyle(doc),
        doc.preset,
        project.pageSize,
        project.margins
      ]);
      const prev = sigs.current.get(doc.id);
      sigs.current.set(doc.id, sig);
      // Primera vez (recién creado o proyecto recién abierto) → registrar sin compilar.
      // Sin compiledB64 no hay nada viejo que refrescar: la primera ⚡ es del editor.
      if (prev === undefined || prev === sig || !doc.compiledB64) continue;
      schedule(doc.id);
    }
    // Docs que ya no existen: soltar firma, timer, corridas en vuelo y estado ocupado
    for (const id of [...sigs.current.keys()]) {
      if (seen.has(id)) continue;
      sigs.current.delete(id);
      const t = timers.current.get(id);
      if (t !== undefined) clearTimeout(t);
      timers.current.delete(id);
      tokens.current.set(id, (tokens.current.get(id) ?? 0) + 1);
      clearBusy(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.docs, project.pageSize, project.margins]);

  return busy;
}
