import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from "pdf-lib";

let exportProject;
let unsupportedPatchChars;
let pdfImportProblem;
let workDir;
let outputPath;
let outputBytes;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-quality-"));
  const bundlePath = path.join(workDir, "exportProject.mjs");
  await build({
    entryPoints: [path.resolve("src/renderer/src/engine/exportProject.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    logLevel: "silent"
  });
  ({ exportProject, unsupportedPatchChars, pdfImportProblem } = await import(pathToFileURL(bundlePath).href));

  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const letter = source.addPage([612, 792]);
  letter.drawText("VECTOR LETTER SOURCE", { x: 72, y: 700, size: 18, font });
  letter.drawRectangle({ x: 72, y: 650, width: 180, height: 20, color: rgb(0.1, 0.3, 0.7) });
  const a4 = source.addPage([595.28, 841.89]);
  a4.drawText("VECTOR A4 SOURCE", { x: 72, y: 750, size: 18, font });
  const sourceB64 = Buffer.from(await source.save()).toString("base64");

  outputBytes = await exportProject({
    version: 1,
    name: "Quality gate",
    pageSize: "letter",
    margins: "compact",
    docs: [],
    pdfs: [{ id: "source", name: "vector-source.pdf", bytesB64: sourceB64 }],
    pages: [
      {
        id: "letter",
        srcId: "source",
        srcKind: "pdf",
        pageIndex: 0,
        rotation: 0,
        background: null,
        patches: []
      },
      {
        id: "a4",
        srcId: "source",
        srcKind: "pdf",
        pageIndex: 1,
        rotation: 90,
        background: "#fbf9f3",
        patches: [{
          id: "patch",
          x: 0.1,
          y: 0.1,
          w: 0.35,
          h: 0.08,
          color: "#ffffff",
          text: "VECTOR PATCH",
          textColor: "#16213e",
          fontSize: 12
        }]
      }
    ]
  });
  outputPath = path.join(workDir, "quality-gate.pdf");
  await writeFile(outputPath, outputBytes);
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test("preserves page count, mixed dimensions, and rotation", async () => {
  const output = await PDFDocument.load(outputBytes);
  assert.equal(output.getPageCount(), 2);
  const [letter, a4] = output.getPages();
  assert.deepEqual(letter.getSize(), { width: 612, height: 792 });
  assert.ok(Math.abs(a4.getWidth() - 595.28) < 0.01);
  assert.ok(Math.abs(a4.getHeight() - 841.89) < 0.01);
  assert.equal(a4.getRotation().angle, 90);
});

test("keeps source and patch text extractable", (t) => {
  const result = spawnSync("pdftotext", [outputPath, "-"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return t.skip("Poppler pdftotext is not installed");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VECTOR LETTER SOURCE/);
  assert.match(result.stdout, /VECTOR A4 SOURCE/);
  assert.match(result.stdout, /VECTOR PATCH/);
});

test("does not introduce raster images into vector-only source pages", (t) => {
  const result = spawnSync("pdfimages", ["-list", outputPath], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return t.skip("Poppler pdfimages is not installed");
  assert.equal(result.status, 0, result.stderr);
  const dataLines = result.stdout
    .split("\n")
    .filter((line) => /^\s*\d+\s+\d+\s+/.test(line));
  assert.deepEqual(dataLines, []);
});

const projectWith = (pdfs, pages) => ({
  version: 1,
  name: "Regression",
  pageSize: "letter",
  margins: "compact",
  docs: [],
  pdfs,
  pages
});

const pdfRef = (id, srcId, pageIndex, extra = {}) => ({
  id,
  srcId,
  srcKind: "pdf",
  pageIndex,
  rotation: 0,
  background: null,
  patches: [],
  ...extra
});

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

/** Center pixel color of each quadrant (TL, TR, BL, BR) of page 1, rendered by Poppler. */
async function quadrantColors(bytes) {
  const file = path.join(workDir, `render-${Math.random().toString(36).slice(2)}.pdf`);
  await writeFile(file, bytes);
  const result = spawnSync("pdftoppm", ["-r", "36", "-f", "1", "-l", "1", file], { maxBuffer: 1 << 24 });
  if (result.error?.code === "ENOENT") return null;
  assert.equal(result.status, 0, String(result.stderr));
  const header = result.stdout.toString("latin1", 0, 32).split(/\s+/);
  assert.equal(header[0], "P6");
  const [width, height] = [Number(header[1]), Number(header[2])];
  const offset = result.stdout.length - width * height * 3;
  const at = (fx, fy) => {
    const i = offset + (Math.floor(fy * height) * width + Math.floor(fx * width)) * 3;
    return [...result.stdout.subarray(i, i + 3)];
  };
  return { tl: at(0.25, 0.25), tr: at(0.75, 0.25), bl: at(0.25, 0.75), br: at(0.75, 0.75) };
}

test("shares source resources across pages instead of duplicating them per page", async () => {
  const source = await PDFDocument.create();
  // ~150 KB Form XObject referenced by every page, like an embedded font or logo
  const shared = source.context.register(
    source.context.stream("0 0 m 1 1 l S\n".repeat(11000), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 1, 1] })
  );
  for (let i = 0; i < 20; i++) {
    const page = source.addPage([612, 792]);
    page.node.setXObject(PDFName.of("Shared"), shared);
    page.pushOperators();
  }
  const sourceBytes = await source.save();
  const pdfs = [{ id: "shared", name: "shared.pdf", bytesB64: b64(sourceBytes) }];

  const direct = await exportProject(projectWith(pdfs, Array.from({ length: 20 }, (_, i) => pdfRef(`d${i}`, "shared", i))));
  const layered = await exportProject(
    projectWith(pdfs, Array.from({ length: 20 }, (_, i) => pdfRef(`l${i}`, "shared", i, { background: "#fbf9f3" })))
  );

  assert.ok(direct.length < sourceBytes.length * 1.5, `direct export grew to ${direct.length} bytes`);
  assert.ok(layered.length < sourceBytes.length * 1.5, `layered export grew to ${layered.length} bytes`);
});

test("keeps duplicated direct pages independent", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  const annotation = source.context.register(
    source.context.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 30, 30], Contents: PDFString.of("note") })
  );
  page.node.set(PDFName.of("Annots"), source.context.obj([annotation]));

  const output = await PDFDocument.load(
    await exportProject(
      projectWith(
        [{ id: "annotated", name: "annotated.pdf", bytesB64: b64(await source.save()) }],
        [pdfRef("first", "annotated", 0), pdfRef("copy", "annotated", 0, { rotation: 90 })]
      )
    )
  );

  const [first, copy] = output.getPages();
  assert.deepEqual([first.getRotation().angle, copy.getRotation().angle], [0, 90]);
  // An annotation dictionary may belong to only one page (ISO 32000-1, 12.5.2)
  assert.notEqual(first.node.Annots().get(0).toString(), copy.node.Annots().get(0).toString());
});

test("layers only the visible CropBox and anchors patches to it", async (t) => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 0, 0) });
  page.drawRectangle({ x: 100, y: 100, width: 300, height: 400, color: rgb(0, 0, 1) });
  page.setCropBox(100, 100, 300, 400);

  const bytes = await exportProject(
    projectWith(
      [{ id: "cropped", name: "cropped.pdf", bytesB64: b64(await source.save()) }],
      [
        pdfRef("cropped-page", "cropped", 0, {
          background: "#fbf9f3",
          patches: [{ id: "tl", x: 0, y: 0, w: 0.5, h: 0.5, color: "#00ff00", text: "", textColor: "#000000", fontSize: 10 }]
        })
      ]
    )
  );

  const output = await PDFDocument.load(bytes);
  assert.deepEqual(output.getPage(0).getSize(), { width: 300, height: 400 });

  const colors = await quadrantColors(bytes);
  if (!colors) return t.skip("Poppler pdftoppm is not installed");
  assert.deepEqual(colors.tl, [0, 255, 0], "patch must cover the visible top-left quadrant");
  for (const quadrant of [colors.tr, colors.bl, colors.br]) {
    assert.deepEqual(quadrant, [0, 0, 255], "only the cropped (blue) area may be visible");
  }
});

test("paints background and patches on blank pages without content streams", async () => {
  const source = await PDFDocument.create();
  source.addPage([400, 500]);

  const output = await PDFDocument.load(
    await exportProject(
      projectWith(
        [{ id: "blank", name: "blank.pdf", bytesB64: b64(await source.save()) }],
        [
          pdfRef("blank-page", "blank", 0, {
            background: "#16213e",
            patches: [{ id: "p", x: 0.1, y: 0.1, w: 0.5, h: 0.2, color: "#ffffff", text: "BLANK PATCH", textColor: "#000000", fontSize: 12 }]
          })
        ]
      )
    )
  );

  assert.equal(output.getPageCount(), 1);
  assert.deepEqual(output.getPage(0).getSize(), { width: 400, height: 500 });
});

const singlePagePdf = async (draw = () => {}) => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  await draw(page, source);
  return b64(await source.save());
};

test("names the patch characters the PDF cannot draw instead of failing in English", async () => {
  assert.deepEqual(unsupportedPatchChars("año ¿ñ? “€” — → ✓ →"), ["→", "✓"]);
  const pdfs = [{ id: "s", name: "s.pdf", bytesB64: await singlePagePdf() }];
  const patch = { id: "p", x: 0.1, y: 0.1, w: 0.4, h: 0.1, color: "#ffffff", text: "Total → $200", textColor: "#000000", fontSize: 11 };
  await assert.rejects(exportProject(projectWith(pdfs, [pdfRef("page", "s", 0, { patches: [patch] })])), /página 1 .*no puede dibujar: →/);
});

test("wraps long patch text inside the patch, as the patch editor shows it", async (t) => {
  const pdfs = [{ id: "s", name: "s.pdf", bytesB64: await singlePagePdf() }];
  const patch = {
    id: "p", x: 0.1, y: 0.1, w: 0.3, h: 0.3, color: "#ffffff", textColor: "#000000", fontSize: 11,
    text: "Esta corrección es bastante más larga que el ancho del parche que la contiene"
  };
  const file = path.join(workDir, "wrapped.pdf");
  await writeFile(file, await exportProject(projectWith(pdfs, [pdfRef("page", "s", 0, { patches: [patch] })])));
  const result = spawnSync("pdftotext", ["-bbox", file, "-"]);
  if (result.error?.code === "ENOENT") return t.skip("Poppler pdftotext is not installed");
  const words = [...result.stdout.toString().matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"/g)];
  const right = (patch.x + patch.w) * 612;
  assert.ok(words.length > 5);
  assert.ok(words.every((w) => Number(w[3]) <= right + 0.5), "every word must end inside the patch");
  assert.ok(new Set(words.map((w) => w[2])).size >= 2, "the text must wrap onto several lines");
});

test("keeps the source /Rotate on layered pages and places patches where the editor shows them", async (t) => {
  const pdfs = [{
    id: "rotated",
    name: "rotated.pdf",
    bytesB64: await singlePagePdf((page) => {
      page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 0, 0) });
      page.setRotation(degrees(90));
    })
  }];
  // The patch editor draws on the page as pdf.js shows it: rotated, 792 wide and 612 tall
  const patch = { id: "tl", x: 0, y: 0, w: 0.5, h: 0.5, color: "#00ff00", text: "", textColor: "#000000", fontSize: 10 };
  const bytes = await exportProject(projectWith(pdfs, [pdfRef("page", "rotated", 0, { background: "#fbf9f3", patches: [patch] })]));
  assert.equal((await PDFDocument.load(bytes)).getPage(0).getRotation().angle, 90);

  const organizerTurn = await exportProject(projectWith(pdfs, [pdfRef("page", "rotated", 0, { background: "#fbf9f3", rotation: 90 })]));
  assert.equal((await PDFDocument.load(organizerTurn)).getPage(0).getRotation().angle, 180);

  const colors = await quadrantColors(bytes);
  if (!colors) return t.skip("Poppler pdftoppm is not installed");
  assert.deepEqual(colors.tl, [0, 255, 0], "patch must cover the top-left quadrant of the rotated view");
  for (const quadrant of [colors.tr, colors.bl, colors.br]) assert.deepEqual(quadrant, [255, 0, 0]);
});

test("reports owner-password and damaged PDFs in Spanish at import and at export", async () => {
  const locked = await PDFDocument.create();
  locked.addPage();
  locked.context.trailerInfo.Encrypt = locked.context.obj({ Filter: "Standard" });
  const lockedBytes = await locked.save();

  assert.match(await pdfImportProblem(lockedBytes), /protegido con contraseña/);
  assert.match(await pdfImportProblem(new TextEncoder().encode("not a pdf")), /dañado/);
  assert.equal(await pdfImportProblem(Buffer.from(await singlePagePdf(), "base64")), null);

  const pdfs = [{ id: "locked", name: "banco.pdf", bytesB64: b64(lockedBytes) }];
  await assert.rejects(exportProject(projectWith(pdfs, [pdfRef("page", "locked", 0)])), /"banco\.pdf" está protegido/);
});

test("tints a page that paints its own opaque white sheet when Teñir la hoja is on", async (t) => {
  // Like a Google Docs export: a full-page white rectangle first, then black content
  const pdfs = [{
    id: "opaque",
    name: "opaque.pdf",
    bytesB64: await singlePagePdf((page) => {
      page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 306, y: 0, width: 306, height: 396, color: rgb(0, 0, 0) });
    })
  }];
  const under = await exportProject(projectWith(pdfs, [pdfRef("page", "opaque", 0, { background: "#f4e4e1" })]));
  const tinted = await exportProject(projectWith(pdfs, [pdfRef("page", "opaque", 0, { background: "#f4e4e1", tint: true })]));

  const file = path.join(workDir, "tinted.pdf");
  await writeFile(file, tinted);
  const images = spawnSync("pdfimages", ["-list", file]);
  if (images.error?.code !== "ENOENT") {
    assert.deepEqual(images.stdout.toString().split("\n").slice(2).filter((line) => line.trim()), []);
  }

  const before = await quadrantColors(under);
  const after = await quadrantColors(tinted);
  if (!before || !after) return t.skip("Poppler pdftoppm is not installed");
  assert.deepEqual(before.tl, [255, 255, 255], "a background below stays hidden by the opaque sheet");
  assert.deepEqual(after.tl, [244, 228, 225], "the white sheet takes the tint");
  assert.deepEqual(after.br, [0, 0, 0], "black content stays black");
});

for (const angle of [180, 270]) {
  test(`places patches where the editor shows them on a source page with /Rotate ${angle}`, async (t) => {
    const pdfs = [{
      id: "turned",
      name: "turned.pdf",
      bytesB64: await singlePagePdf((page) => {
        page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 0, 0) });
        page.setRotation(degrees(angle));
      })
    }];
    const patch = { id: "tl", x: 0, y: 0, w: 0.5, h: 0.5, color: "#00ff00", text: "", textColor: "#000000", fontSize: 10 };
    const bytes = await exportProject(projectWith(pdfs, [pdfRef("page", "turned", 0, { background: "#fbf9f3", patches: [patch] })]));
    assert.equal((await PDFDocument.load(bytes)).getPage(0).getRotation().angle, angle);
    const colors = await quadrantColors(bytes);
    if (!colors) return t.skip("Poppler pdftoppm is not installed");
    assert.deepEqual(colors.tl, [0, 255, 0], "patch on the top-left of the rotated view");
    for (const quadrant of [colors.tr, colors.bl, colors.br]) assert.deepEqual(quadrant, [255, 0, 0]);
  });
}

test("tints a rotated source page and keeps its rotation", async (t) => {
  const pdfs = [{
    id: "turned",
    name: "turned.pdf",
    bytesB64: await singlePagePdf((page) => {
      page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
      page.setRotation(degrees(90));
    })
  }];
  const bytes = await exportProject(projectWith(pdfs, [pdfRef("page", "turned", 0, { background: "#f4e4e1", tint: true })]));
  assert.equal((await PDFDocument.load(bytes)).getPage(0).getRotation().angle, 90);
  const colors = await quadrantColors(bytes);
  if (!colors) return t.skip("Poppler pdftoppm is not installed");
  for (const quadrant of [colors.tl, colors.tr, colors.bl, colors.br]) assert.deepEqual(quadrant, [244, 228, 225]);
});

test("falls back to the MediaBox when the CropBox lies outside it", async () => {
  const pdfs = [{
    id: "badcrop",
    name: "badcrop.pdf",
    bytesB64: await singlePagePdf((page) => page.setCropBox(2000, 2000, 100, 100))
  }];
  const output = await PDFDocument.load(await exportProject(projectWith(pdfs, [pdfRef("page", "badcrop", 0, { background: "#fbf9f3" })])));
  assert.deepEqual(output.getPage(0).getSize(), { width: 612, height: 792 });
});
