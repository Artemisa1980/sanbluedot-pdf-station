import { randomUUID } from "crypto";
import { open, rename, rm } from "fs/promises";
import path from "path";

/* Reglas puras del proceso principal, sin Electron: así se prueban en tests/main.test.mjs */

/** Ruta de proyecto aceptable: absoluta y .sbstation; cualquier otra cosa → null. */
export function projectPath(value: unknown): string | null {
  return typeof value === "string" && path.isAbsolute(value) && /\.sbstation$/i.test(value)
    ? path.normalize(value)
    : null;
}

/** Escritura atómica: tmp único + fsync + rename. Si algo falla, el destino queda intacto. */
export async function atomicWrite(target: string, data: string | Buffer): Promise<void> {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const handle = await open(tmp, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

/** El borrador solo recuerda una ruta que el usuario ya eligió en un diálogo de esta ventana:
 *  así un borrador nunca puede autorizar un guardado sin diálogo sobre otro archivo. */
export function draftFilePath(requested: unknown, registered: string | undefined): string | null {
  const p = projectPath(requested);
  return p !== null && p === registered ? p : null;
}

/** Bytes que de verdad son un PDF (cabecera %PDF-). */
export function isPdfBytes(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Mis estilos: solo entradas con la forma mínima esperada; el resto se descarta. */
export function sanitizeMyStyles(list: unknown): unknown[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (s) =>
      isRecord(s) &&
      typeof s.id === "string" &&
      typeof s.label === "string" &&
      typeof s.baseId === "string" &&
      isRecord(s.style)
  );
}

/** URL del servidor de desarrollo: jamás en la app empaquetada, aunque exista la variable. */
export function devRendererUrl(isPackaged: boolean, env: Record<string, string | undefined>): string | null {
  return !isPackaged && env.ELECTRON_RENDERER_URL ? env.ELECTRON_RENDERER_URL : null;
}

/** Esquemas de red que la estación offline cancela siempre. */
export const NETWORK_URL_PATTERNS = ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*", "ftp://*/*"];

/** Cola de turnos: como mucho `limit` tareas a la vez, el resto espera su turno en orden. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    // El turno se pasa directo al siguiente en espera: nadie se cuela entre medio
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/** Encadena operaciones para que nunca se pisen (borrador: escribir / borrar). */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = tail.then(task, task);
    tail = next.catch(() => {});
    return next;
  };
}
