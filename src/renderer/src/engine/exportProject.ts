import {
  BlendMode,
  PDFDocument,
  PDFEmbeddedPage,
  PDFFont,
  PDFPage,
  StandardFonts,
  breakTextIntoLines,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PageBoundingBox
} from "pdf-lib";
import { b64ToBytes } from "../../../shared/b64";
import { effectiveBackground } from "./sources";
import type { PageRef, StationProject } from "../../../shared/types";

/* El texto de los parches usa Helvetica estándar (codificación WinAnsi): latín con acentos,
   ñ, ¿¡, €, comillas y rayas. Un carácter fuera de esa tabla (→ ✓ ≥ α, emoji, ᵈᵒᵗ) hacía
   fallar TODA la exportación con un error en inglés. */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Caracteres del texto de un parche que el PDF no puede dibujar (sin repetir, en orden). */
export function unsupportedPatchChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) continue;
    bad.add(ch);
  }
  return [...bad];
}

/* pdf-lib compila sus errores a ES5: `instanceof EncryptedPDFError` da false (verificado con
   pdf-lib 1.17.1), así que el PDF protegido se reconoce por el mensaje del error. */
const isEncryptedError = (e: unknown): boolean => e instanceof Error && /is encrypted/.test(e.message);

/** Revisa un PDF al importarlo: null si se puede exportar, o el motivo en español. */
export async function pdfImportProblem(bytes: Uint8Array): Promise<string | null> {
  try {
    await PDFDocument.load(bytes);
    return null;
  } catch (e) {
    return isEncryptedError(e)
      ? "está protegido con contraseña de permisos y no se podría exportar. Quítale la protección y vuelve a importarlo."
      : "no se pudo leer: el archivo está dañado o no es un PDF.";
  }
}

/**
 * Punto de la vista que muestra pdf.js (página girada por su /Rotate, origen arriba-izquierda,
 * en puntos) → puntos PDF de la página sin girar (origen abajo-izquierda). El editor de parches
 * dibuja sobre esa vista, así que los parches se convierten con esta función.
 */
function viewToPdf(rotate: number, width: number, height: number) {
  return (u: number, v: number): [number, number] => {
    switch (rotate) {
      case 90:
        return [v, u];
      case 180:
        return [width - u, v];
      case 270:
        return [width - v, height - u];
      default:
        return [u, height - v];
    }
  };
}

/**
 * EL CORAZÓN DE LA ESTACIÓN — Principio 1 del framework: nunca rasterizar.
 *
 * - Página sin fondo ni parches → copyPages: transfusión pura del contenido original.
 * - Página con fondo/parches → truco de capas vectorial: rectángulo de color debajo,
 *   la página original incrustada encima (embedPdf), parches encima de todo.
 *   El contenido original jamás se reescribe ni se rasteriza.
 */

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function srcBytes(project: StationProject, ref: PageRef): Uint8Array {
  if (ref.srcKind === "pdf") {
    const pdf = project.pdfs.find((p) => p.id === ref.srcId);
    if (!pdf) throw new Error(`Fuente PDF no encontrada (${ref.srcId}).`);
    return b64ToBytes(pdf.bytesB64);
  }
  const doc = project.docs.find((d) => d.id === ref.srcId);
  if (!doc) throw new Error(`Documento no encontrado (${ref.srcId}).`);
  if (!doc.compiledB64) throw new Error(`El documento "${doc.name}" no está compilado — ábrelo y dale ⚡ Compilar.`);
  return b64ToBytes(doc.compiledB64);
}

/**
 * Caja visible de la página: CropBox recortada a la MediaBox, igual que pdf.js en las
 * miniaturas y el editor de parches. Incrustar la MediaBox completa (lo que hace embedPdf
 * por defecto) revelaba lo recortado, cambiaba el tamaño de la hoja y movía los parches.
 */
function visibleBox(page: PDFPage): PageBoundingBox {
  const toBox = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => ({
    left: Math.min(x, x + width),
    bottom: Math.min(y, y + height),
    right: Math.max(x, x + width),
    top: Math.max(y, y + height)
  });
  const media = toBox(page.getMediaBox());
  const crop = toBox(page.getCropBox());
  const box = {
    left: Math.max(media.left, crop.left),
    bottom: Math.max(media.bottom, crop.bottom),
    right: Math.min(media.right, crop.right),
    top: Math.min(media.top, crop.top)
  };
  return box.right > box.left && box.top > box.bottom ? box : media;
}

export async function exportProject(project: StationProject): Promise<Uint8Array> {
  if (project.pages.length === 0) throw new Error("El documento está vacío.");

  const out = await PDFDocument.create();
  const srcDocs = new Map<string, PDFDocument>();
  let font: PDFFont | null = null;

  for (const [i, ref] of project.pages.entries()) {
    const bad = ref.patches.flatMap((p) => unsupportedPatchChars(p.text));
    if (bad.length > 0) {
      throw new Error(
        `Un parche de la página ${i + 1} usa caracteres que el PDF no puede dibujar: ${[...new Set(bad)].join(" ")}. Cámbialos en el editor de parches.`
      );
    }
  }

  for (const ref of project.pages) {
    if (srcDocs.has(ref.srcId)) continue;
    try {
      srcDocs.set(ref.srcId, await PDFDocument.load(srcBytes(project, ref)));
    } catch (e) {
      if (!isEncryptedError(e)) throw e;
      const name = project.pdfs.find((p) => p.id === ref.srcId)?.name ?? ref.srcId;
      throw new Error(`"${name}" está protegido con contraseña de permisos: quítale la protección y vuelve a importarlo.`);
    }
  }

  // Fondo efectivo: manual o el papel de color del doc (pinta la hoja completa,
  // márgenes incluidos — printToPDF los deja blancos, verificado 2026-07-02)
  const plans = project.pages.map((ref) => {
    const background = effectiveBackground(project, ref);
    return { ref, background, layered: Boolean(background) || ref.patches.length > 0 };
  });

  // Copiar e incrustar EN LOTE por fuente: pdf-lib crea un copiador nuevo en cada llamada,
  // así que página por página duplicaba los recursos compartidos (fuentes, imágenes) una
  // vez por hoja — 40 páginas de un PDF de 300 KB salían en 12 MB. Una página repetida en
  // el camino directo va en otra tanda: cada copia conserva sus propios objetos (una
  // anotación no puede pertenecer a dos páginas).
  const batches = new Map<string, { src: PDFDocument; layered: boolean; slots: number[] }>();
  const copiesSoFar = new Map<string, number>();
  plans.forEach(({ ref, layered }, slot) => {
    let round = 0;
    if (!layered) {
      const pageKey = JSON.stringify([ref.srcId, ref.pageIndex]);
      round = copiesSoFar.get(pageKey) ?? 0;
      copiesSoFar.set(pageKey, round + 1);
    }
    const key = JSON.stringify([ref.srcId, layered, round]);
    let batch = batches.get(key);
    if (!batch) {
      batch = { src: srcDocs.get(ref.srcId)!, layered, slots: [] };
      batches.set(key, batch);
    }
    batch.slots.push(slot);
  });

  const copied = new Map<number, PDFPage>();
  const embedded = new Map<number, PDFEmbeddedPage>();
  for (const { src, layered, slots } of batches.values()) {
    if (!layered) {
      const pages = await out.copyPages(src, slots.map((slot) => plans[slot].ref.pageIndex));
      pages.forEach((page, k) => copied.set(slots[k], page));
      continue;
    }
    // Una hoja en blanco sin /Contents no se puede incrustar: lleva solo fondo y parches
    const withContent = slots.filter((slot) => src.getPage(plans[slot].ref.pageIndex).node.Contents());
    const srcPages = withContent.map((slot) => src.getPage(plans[slot].ref.pageIndex));
    const pages = await out.embedPages(srcPages, srcPages.map(visibleBox));
    pages.forEach((page, k) => embedded.set(withContent[k], page));
  }

  for (const [slot, { ref, background, layered }] of plans.entries()) {
    if (!layered) {
      // Camino directo: transfusión pura
      const page = copied.get(slot)!;
      if (ref.rotation) {
        page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
      }
      out.addPage(page);
      continue;
    }

    // Camino de capas: fondo → original → parches (todo vectorial)
    const srcPage = srcDocs.get(ref.srcId)!.getPage(ref.pageIndex);
    const box = visibleBox(srcPage);
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    const page = out.addPage([width, height]);
    // Giro propio de la página fuente (/Rotate, típico de escaneos): la hoja se arma sin girar
    // y la salida lo conserva sumado al giro del organizador
    const srcRotation = ((srcPage.getRotation().angle % 360) + 360) % 360;
    const sideways = srcRotation === 90 || srcRotation === 270;
    const viewW = sideways ? height : width;
    const viewH = sideways ? width : height;
    const toPdf = viewToPdf(srcRotation, width, height);

    // Fondo normal: debajo del original. Teñir la hoja (PDFs con hoja blanca opaca propia):
    // encima en modo multiplicar, como un acetato de color — lo blanco toma el color y el
    // texto negro sigue negro. Los parches van después, sin teñir.
    const tint = Boolean(background && ref.tint);
    if (background && !tint) {
      page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(background) });
    }

    const original = embedded.get(slot);
    if (original) page.drawPage(original);

    if (background && tint) {
      page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(background), blendMode: BlendMode.Multiply });
    }

    for (const p of ref.patches) {
      // Coordenadas normalizadas top-left de la vista del editor → rectángulo en puntos PDF
      const u = p.x * viewW;
      const v = p.y * viewH;
      const w = p.w * viewW;
      const h = p.h * viewH;
      const [x1, y1] = toPdf(u, v);
      const [x2, y2] = toPdf(u + w, v + h);
      const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
      page.drawRectangle({ ...rect, color: hexToRgb(p.color) });
      if (!p.text.trim()) continue;

      if (!font) font = await out.embedFont(StandardFonts.Helvetica);
      const textFont = font;
      const size = p.fontSize;
      const lineHeight = size * 1.3;
      const pad = size * 0.4;
      // Igual que el editor: el texto se acomoda al ancho del parche y lo que no cabe se recorta
      const lines = p.text
        .split("\n")
        .flatMap((line) => breakTextIntoLines(line, [" "], w - 2 * pad, (t) => textFont.widthOfTextAtSize(t, size)));
      page.pushOperators(pushGraphicsState(), rectangle(rect.x, rect.y, rect.width, rect.height), clip(), endPath());
      lines.forEach((line, i) => {
        if (pad + i * lineHeight >= h) return;
        const [x, y] = toPdf(u + pad, v + pad + size + i * lineHeight);
        page.drawText(line, { x, y, size, font: textFont, color: hexToRgb(p.textColor), rotate: degrees(srcRotation) });
      });
      page.pushOperators(popGraphicsState());
    }

    const rotation = (srcRotation + ref.rotation) % 360;
    if (rotation) page.setRotation(degrees(rotation));
  }

  return out.save();
}
