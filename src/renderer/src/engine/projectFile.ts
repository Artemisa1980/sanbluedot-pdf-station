import type { DocStyle, PageRef, Patch, SourceDoc, StationProject } from "../../../shared/types";

type UnknownRecord = Record<string, unknown>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ROTATIONS = new Set([0, 90, 180, 270]);

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isColor(value: unknown): value is string {
  return isString(value) && HEX_COLOR.test(value);
}

function isDocStyle(value: unknown): value is DocStyle {
  if (!isRecord(value)) return false;
  return (
    isString(value.fontId) &&
    typeof value.fontSizePt === "number" && Number.isFinite(value.fontSizePt) && value.fontSizePt > 0 &&
    typeof value.lineHeight === "number" && Number.isFinite(value.lineHeight) && value.lineHeight > 0 &&
    isColor(value.bgColor) &&
    isColor(value.textColor) &&
    isColor(value.thBg) &&
    isColor(value.thText)
  );
}

function isPatch(value: unknown): value is Patch {
  if (!isRecord(value)) return false;
  const normalized = [value.x, value.y, value.w, value.h];
  return (
    isString(value.id) && value.id.length > 0 &&
    normalized.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
    (value.w as number) > 0 &&
    (value.h as number) > 0 &&
    (value.x as number) + (value.w as number) <= 1.000001 &&
    (value.y as number) + (value.h as number) <= 1.000001 &&
    isColor(value.color) &&
    isString(value.text) &&
    isColor(value.textColor) &&
    typeof value.fontSize === "number" && Number.isFinite(value.fontSize) && value.fontSize > 0
  );
}

function isSourceDoc(value: unknown): value is SourceDoc {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.name) &&
    (value.kind === "md" || value.kind === "html") &&
    isString(value.content) &&
    isString(value.preset) &&
    (value.style === undefined || isDocStyle(value.style)) &&
    (value.compiledB64 === null || (isString(value.compiledB64) && value.compiledB64.length > 0))
  );
}

function isPageRef(value: unknown): value is PageRef {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.srcId) && value.srcId.length > 0 &&
    (value.srcKind === "pdf" || value.srcKind === "doc") &&
    Number.isInteger(value.pageIndex) && (value.pageIndex as number) >= 0 &&
    ROTATIONS.has(value.rotation as number) &&
    (value.background === null || isColor(value.background)) &&
    Array.isArray(value.patches) && value.patches.every(isPatch)
  );
}

function hasUniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function validateProject(data: unknown): data is StationProject {
  if (!isRecord(data)) return false;
  if (
    data.version !== 1 ||
    !isString(data.name) ||
    (data.pageSize !== "letter" && data.pageSize !== "a4") ||
    (data.margins !== "compact" && data.margins !== "apa") ||
    !Array.isArray(data.docs) || !data.docs.every(isSourceDoc) ||
    !Array.isArray(data.pdfs) ||
    !data.pdfs.every(
      (pdf) =>
        isRecord(pdf) &&
        isString(pdf.id) && pdf.id.length > 0 &&
        isString(pdf.name) &&
        isString(pdf.bytesB64) && pdf.bytesB64.length > 0
    ) ||
    !Array.isArray(data.pages) || !data.pages.every(isPageRef)
  ) {
    return false;
  }

  const sourceIds = [
    ...data.docs.map((doc) => doc.id),
    ...data.pdfs.map((pdf) => pdf.id as string)
  ];
  if (!hasUniqueStrings(sourceIds) || !hasUniqueStrings(data.pages.map((page) => page.id))) return false;

  const sourceKinds = new Map<string, "doc" | "pdf">([
    ...data.docs.map((doc) => [doc.id, "doc"] as const),
    ...data.pdfs.map((pdf) => [pdf.id as string, "pdf"] as const)
  ]);
  return data.pages.every(
    (page) =>
      sourceKinds.get(page.srcId) === page.srcKind &&
      hasUniqueStrings(page.patches.map((patch) => patch.id))
  );
}

export function serialize(project: StationProject): string {
  return JSON.stringify(project);
}

export function deserialize(json: string): StationProject {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("El archivo no es un proyecto .sbstation válido (JSON dañado).");
  }
  if (!validateProject(data)) {
    throw new Error("El archivo no es un proyecto .sbstation válido (estructura desconocida).");
  }
  // Nota: proyectos guardados con el campo de firma viejo simplemente lo ignoran —
  // la firma ahora vive únicamente dentro del contenido de cada documento.
  return data;
}
