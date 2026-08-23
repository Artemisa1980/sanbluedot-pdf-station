import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

let exportProject;
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
  ({ exportProject } = await import(pathToFileURL(bundlePath).href));

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
