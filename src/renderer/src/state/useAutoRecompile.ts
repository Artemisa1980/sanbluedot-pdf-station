import { useEffect, useMemo, useRef, useState } from "react";
import { useStation } from "./store";
import { compileDoc } from "../engine/compile";
import { docSignature, isStale } from "../engine/staleness";

/**
 * Vigilante de documentos compilados: cada doc guarda la firma (texto, estilo, preset,
 * página y márgenes) con que se compiló su PDF. Si la fuente actual ya no coincide, el
 * PDF está viejo y este hook lo recompila solo, con pausa, en cualquier vista.
 *
 * - Editar el texto o el estilo y exportar sin ⚡ Compilar ya no saca la versión anterior.
 * - Un proyecto guardado a mitad de una pausa, o de antes de v1.10, se recompila al abrirlo.
 * - Un resultado que llega cuando el doc ya cambió (más texto, otro proyecto con el mismo
 *   id) se descarta.
 * - Si una compilación falla, el doc queda viejo y EXPORTAR sigue bloqueado hasta que el
 *   texto cambie o se compile con ⚡ (sin reintentos en bucle).
 *
 * Devuelve `busy` (esperando la pausa o compilando) y `stale` (PDF viejo, incluye los que
 * fallaron) para que la UI lo muestre y el export espere.
 */
const DEBOUNCE_MS = 700;

export function useAutoRecompile(onError: (msg: string) => void): { busy: Set<string>; stale: Set<string> } {
  const { project, dispatch } = useStation();
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  // Firma programada o compilándose por doc, y firma que falló: ninguna se vuelve a programar
  const queued = useRef(new Map<string, string>());
  const failed = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Map<string, number>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  function releaseIfIdle(docId: string) {
    if (timers.current.has(docId) || (inFlight.current.get(docId) ?? 0) > 0) return;
    setBusy((prev) => {
      if (!prev.has(docId)) return prev;
      const next = new Set(prev);
      next.delete(docId);
      return next;
    });
  }

  function schedule(docId: string, sig: string) {
    const pending = timers.current.get(docId);
    if (pending !== undefined) clearTimeout(pending);
    queued.current.set(docId, sig);
    setBusy((prev) => (prev.has(docId) ? prev : new Set(prev).add(docId)));
    timers.current.set(
      docId,
      setTimeout(() => {
        timers.current.delete(docId);
        void run(docId);
      }, DEBOUNCE_MS)
    );
  }

  /** Firma actual del doc en el proyecto vivo, o null si ya no existe */
  function currentSig(docId: string): string | null {
    const proj = projectRef.current;
    const doc = proj.docs.find((d) => d.id === docId);
    return doc ? docSignature(doc, proj) : null;
  }

  async function run(docId: string) {
    const proj = projectRef.current;
    const doc = proj.docs.find((d) => d.id === docId);
    if (!doc) {
      releaseIfIdle(docId);
      return;
    }
    const sig = docSignature(doc, proj);
    inFlight.current.set(docId, (inFlight.current.get(docId) ?? 0) + 1);
    try {
      const { compiledB64, previousPageCount, pageCount } = await compileDoc(doc, proj);
      if (currentSig(docId) !== sig) return; // el doc cambió mientras compilaba: resultado viejo
      failed.current.delete(docId);
      dispatch({ type: "setDocPages", docId, compiledB64, previousPageCount, pageCount, compiledSig: sig });
    } catch (e) {
      if (currentSig(docId) === sig) {
        failed.current.set(docId, sig);
        const detail = e instanceof Error ? e.message : "Error al actualizar el documento.";
        onErrorRef.current(`${detail} Exportar queda en pausa: abre el documento y dale ⚡ Compilar.`);
      }
    } finally {
      if (queued.current.get(docId) === sig) queued.current.delete(docId);
      inFlight.current.set(docId, (inFlight.current.get(docId) ?? 1) - 1);
      releaseIfIdle(docId);
    }
  }

  useEffect(() => {
    const seen = new Set<string>();
    for (const doc of project.docs) {
      seen.add(doc.id);
      // Sin compiledB64 no hay nada viejo que refrescar: la primera ⚡ es del editor
      if (!doc.compiledB64) continue;
      const sig = docSignature(doc, project);
      if (doc.compiledSig === sig || queued.current.get(doc.id) === sig || failed.current.get(doc.id) === sig) continue;
      schedule(doc.id, sig);
    }
    // Docs que ya no existen: soltar firma, timer y estado ocupado
    for (const id of [...new Set([...queued.current.keys(), ...failed.current.keys(), ...timers.current.keys()])]) {
      if (seen.has(id)) continue;
      queued.current.delete(id);
      failed.current.delete(id);
      const t = timers.current.get(id);
      if (t !== undefined) clearTimeout(t);
      timers.current.delete(id);
      releaseIfIdle(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.docs, project.pageSize, project.margins]);

  const stale = useMemo(
    () => new Set(project.docs.filter((d) => isStale(d, project)).map((d) => d.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.docs, project.pageSize, project.margins]
  );

  return { busy, stale };
}
