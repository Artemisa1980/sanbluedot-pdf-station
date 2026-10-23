import { b64ToBytes } from "../../../shared/b64";

/**
 * Caché de bytes decodificados por fuente — evita re-decodificar base64 en cada miniatura.
 * Se identifica por srcId Y por contenido: si el base64 de una fuente cambia (recompilación),
 * los bytes viejos jamás se sirven, aunque la eviction llegue antes de que el store reciba
 * el PDF nuevo. (=== entre strings compara contenido, así que basta comparar el base64.)
 */
interface Entry {
  b64: string;
  bytes: Uint8Array;
}
const cache = new Map<string, Entry>();

const bytesSigs = new WeakMap<Uint8Array, string>();

/** Llave de contenido de unos bytes decodificados para las miniaturas: largo + FNV-1a de TODO
 *  el contenido (una sola vez por arreglo). Un muestreo parcial confundía PDFs del mismo largo. */
export function bytesSignature(bytes: Uint8Array): string {
  let sig = bytesSigs.get(bytes);
  if (sig === undefined) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
    sig = `${bytes.length}-${h.toString(16)}`;
    bytesSigs.set(bytes, sig);
  }
  return sig;
}

export function bytesFor(srcId: string, b64: string): Uint8Array {
  const hit = cache.get(srcId);
  if (hit && hit.b64 === b64) return hit.bytes;
  const bytes = b64ToBytes(b64);
  cache.set(srcId, { b64, bytes });
  return bytes;
}

export function evictBytes(srcId: string): void {
  cache.delete(srcId);
}
