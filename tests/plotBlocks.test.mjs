import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

// plotBlocks.ts tokeniza con marked y las extensiones de fórmulas y ```plot: se empaqueta como los demás motores
let parsePlotBlocks;
let updatePlotBlockInContent;
let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "station-plotblocks-"));
  const outfile = path.join(workDir, "plotBlocks.mjs");
  await build({
    entryPoints: [path.resolve("src/renderer/src/engine/plotBlocks.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent"
  });
  ({ parsePlotBlocks, updatePlotBlockInContent } = await import(pathToFileURL(outfile).href));
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test("parsePlotBlocks extracts multiple ```plot blocks from markdown", () => {
  const md = `# Documento de Prueba

\`\`\`plot
{
  "title": "Gráfica 1",
  "domain": [0, 10],
  "points": [{ "x": 5, "y": 2, "label": "Punto central" }]
}
\`\`\`

Texto intermedio con fórmulas $x^2$.

\`\`\`plot
{
  "title": "Gráfica 2",
  "domain": [-5, 5],
  "axes": false
}
\`\`\`
`;

  const blocks = parsePlotBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].spec.title, "Gráfica 1");
  assert.equal(blocks[0].spec.points?.[0].label, "Punto central");
  assert.equal(blocks[1].spec.title, "Gráfica 2");
  assert.equal(blocks[1].spec.axes, false);
});

test("updatePlotBlockInContent replaces target plot while preserving surrounding markdown", () => {
  const md = `# Encabezado

\`\`\`plot
{
  "title": "Original",
  "domain": [0, 10]
}
\`\`\`

Pie de página.`;

  const updated = updatePlotBlockInContent(md, 0, {
    title: "Modificado",
    domain: [-2, 12],
    points: [{ x: 5, y: 5, label: "Nuevo", dx: 10, dy: -12, anchor: "start" }]
  });

  assert.match(updated, /# Encabezado/);
  assert.match(updated, /Pie de página\./);
  assert.match(updated, /"title": "Modificado"/);
  assert.match(updated, /"dx": 10/);
  assert.doesNotMatch(updated, /"title": "Original"/);

  const blocks = parsePlotBlocks(updated);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].spec.title, "Modificado");
  assert.equal(blocks[0].spec.domain?.[0], -2);
});

test("parsePlotBlocks and updatePlotBlockInContent support Windows CRLF", () => {
  const crlfMd = "# Título\r\n\r\n```plot\r\n{\r\n  \"title\": \"CRLF Plot\",\r\n  \"domain\": [0, 5]\r\n}\r\n```\r\n\r\nTexto\r\n";
  const blocks = parsePlotBlocks(crlfMd);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].spec.title, "CRLF Plot");

  const updated = updatePlotBlockInContent(crlfMd, 0, {
    title: "Updated CRLF",
    domain: [0, 10]
  });
  assert.match(updated, /\r\n/);
  assert.match(updated, /"title": "Updated CRLF"/);
});

test("parsePlotBlocks preserves stable indexing even when an earlier block has invalid JSON", () => {
  const mdWithBroken = `# Broken test
\`\`\`plot
{ broken json
\`\`\`

\`\`\`plot
{
  "title": "Valid Plot",
  "domain": [0, 8]
}
\`\`\`
`;
  const blocks = parsePlotBlocks(mdWithBroken);
  assert.equal(blocks.length, 1);
  // El bloque válido es el segundo bloque en el archivo (index: 1), no se desplaza a 0
  assert.equal(blocks[0].index, 1);
  assert.equal(blocks[0].spec.title, "Valid Plot");

  const updated = updatePlotBlockInContent(mdWithBroken, 1, {
    title: "Updated Valid Plot",
    domain: [0, 12]
  });
  assert.match(updated, /\{ broken json/);
  assert.match(updated, /"title": "Updated Valid Plot"/);
});

test("a ```plot example inside a code fence is not a chart, for the panel or the PDF", () => {
  const md = "````markdown\n```plot\n{\"title\": \"Ejemplo\"}\n```\n````\n\n```plot\n{\"title\": \"Real\"}\n```\n";
  const blocks = parsePlotBlocks(md);
  assert.deepEqual(blocks.map((b) => b.spec.title), ["Real"]);
  const updated = updatePlotBlockInContent(md, blocks[0].index, { title: "Real 2" });
  assert.match(updated, /"title": "Ejemplo"/);
  assert.match(updated, /"title": "Real 2"/);
});

test("a one-line ```plot block stays on one line after an edit; removing yDomain drops the field", () => {
  const md = "```plot\n{\"title\": \"A\", \"fn\": \"x\", \"domain\": [0, 10], \"yDomain\": [0, 10]}\n```\n";
  const [block] = parsePlotBlocks(md);
  const updated = updatePlotBlockInContent(md, block.index, { ...block.spec, yDomain: undefined });
  assert.equal(updated, "```plot\n{\"title\": \"A\", \"fn\": \"x\", \"domain\": [0, 10]}\n```\n");
});

test("a ```plot block right after a list is still found", () => {
  const md = "- item\n\n```plot\n{\"title\": \"Tras la lista\"}\n```\n";
  assert.deepEqual(parsePlotBlocks(md).map((b) => b.spec.title), ["Tras la lista"]);
});
