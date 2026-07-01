import { b64ToBytes } from "../../../shared/b64";

/** Caché de bytes decodificados por fuente — evita re-decodificar base64 en cada miniatura. */
const cache = new Map<string, Uint8Array>();

export function bytesFor(srcId: string, b64: string): Uint8Array {
  let v = cache.get(srcId);
  if (!v) {
    v = b64ToBytes(b64);
    cache.set(srcId, v);
  }
  return v;
}

export function evictBytes(srcId: string): void {
  cache.delete(srcId);
}
