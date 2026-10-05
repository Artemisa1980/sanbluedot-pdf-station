import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

let reducer;
let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-store-"));
  const bundlePath = path.join(workDir, "store.mjs");
  await build({
    entryPoints: [path.resolve("src/renderer/src/state/store.tsx")],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: bundlePath,
    logLevel: "silent"
  });
  ({ reducer } = await import(pathToFileURL(bundlePath).href));
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

const emptyState = () => ({
  project: { version: 1, name: "Nuevo", pageSize: "letter", margins: "compact", docs: [], pdfs: [], pages: [] },
  selection: [],
  dirty: false
});

test("ignores a compilation that finishes after its document is gone", () => {
  // ⚡ Compilar still running when the document is deleted, or when Nuevo/Abrir replaces the project
  const state = emptyState();
  const next = reducer(state, { type: "setDocPages", docId: "deleted", compiledB64: "AA==", previousPageCount: 0, pageCount: 2 });
  assert.equal(next, state);
  assert.deepEqual(next.project.pages, []);
});

test("adds the compiled pages of a document that still exists", () => {
  const state = emptyState();
  state.project.docs.push({ id: "doc", name: "a.md", kind: "md", content: "# A", preset: "sanbluedot", compiledB64: null });
  const next = reducer(state, { type: "setDocPages", docId: "doc", compiledB64: "AA==", previousPageCount: 0, pageCount: 2 });
  assert.deepEqual(next.project.pages.map((p) => [p.srcId, p.pageIndex]), [["doc", 0], ["doc", 1]]);
  assert.equal(next.project.docs[0].compiledB64, "AA==");
});

test("turns Teñir la hoja on and off for the selected pages only", () => {
  const state = emptyState();
  state.project.pdfs.push({ id: "pdf", name: "a.pdf", bytesB64: "AA==" });
  for (const id of ["a", "b"]) {
    state.project.pages.push({ id, srcId: "pdf", srcKind: "pdf", pageIndex: 0, rotation: 0, background: "#f4e4e1", patches: [] });
  }
  const on = reducer(state, { type: "setTint", ids: ["a"], value: true });
  assert.deepEqual(on.project.pages.map((p) => p.tint), [true, undefined]);
  assert.equal(on.dirty, true);
  const off = reducer(on, { type: "setTint", ids: ["a"], value: false });
  assert.equal(off.project.pages[0].tint, false);
});

test("records the signature a document was compiled with", () => {
  const state = emptyState();
  state.project.docs.push({ id: "doc", name: "a.md", kind: "md", content: "# A", preset: "sanbluedot", compiledB64: null });
  const next = reducer(state, { type: "setDocPages", docId: "doc", compiledB64: "AA==", previousPageCount: 0, pageCount: 1, compiledSig: "sig-1" });
  assert.equal(next.project.docs[0].compiledSig, "sig-1");
});
