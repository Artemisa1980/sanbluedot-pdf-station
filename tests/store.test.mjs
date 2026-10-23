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

test("drops a compilation based on an older compiled PDF than the one already stored", () => {
  const state = emptyState();
  state.project.docs.push({ id: "d", name: "a.md", kind: "md", content: "x", preset: "sanbluedot", compiledB64: "NEW=" });
  state.project.pages.push({ id: "p0", srcId: "d", srcKind: "doc", pageIndex: 0, rotation: 0, background: null, patches: [] });
  const stale = { type: "setDocPages", docId: "d", compiledB64: "OTHER=", compiledSig: "s", previousPageCount: 0, pageCount: 3, basedOnB64: "OLD=" };
  assert.equal(reducer(state, stale), state, "a result read from OLD= would re-add deleted pages");
  const fresh = reducer(state, { ...stale, basedOnB64: "NEW=", previousPageCount: 1 });
  assert.equal(fresh.project.docs[0].compiledB64, "OTHER=");
  assert.equal(fresh.project.pages.length, 3);
});

test("movePages with the Alt+Arrow indices moves a page or a block exactly one slot", () => {
  // The Organizer nudges with toIndex = first - 1 (left) or last + 2 (right)
  const state = emptyState();
  state.project.pdfs.push({ id: "pdf", name: "a.pdf", bytesB64: "AA==" });
  for (const id of ["a", "b", "c", "d"]) {
    state.project.pages.push({ id, srcId: "pdf", srcKind: "pdf", pageIndex: 0, rotation: 0, background: null, patches: [] });
  }
  const order = (s) => s.project.pages.map((p) => p.id).join("");
  assert.equal(order(reducer(state, { type: "movePages", ids: ["a"], toIndex: 0 + 2 })), "bacd");
  assert.equal(order(reducer(state, { type: "movePages", ids: ["c"], toIndex: 2 - 1 })), "acbd");
  // A two-page block (b, c) one slot right and left
  assert.equal(order(reducer(state, { type: "movePages", ids: ["b", "c"], toIndex: 2 + 2 })), "adbc");
  assert.equal(order(reducer(state, { type: "movePages", ids: ["b", "c"], toIndex: 1 - 1 })), "bcad");
});

test("setDocPages keeps the selection only for pages that still exist", () => {
  const state = emptyState();
  state.project.docs.push({ id: "d", name: "a.md", kind: "md", content: "x", preset: "sanbluedot", compiledB64: "OLD=" });
  for (let i = 0; i < 3; i++) {
    state.project.pages.push({ id: `p${i}`, srcId: "d", srcKind: "doc", pageIndex: i, rotation: 0, background: null, patches: [] });
  }
  state.selection = ["p0", "p2"];
  const next = reducer(state, { type: "setDocPages", docId: "d", compiledB64: "NEW=", compiledSig: "s", previousPageCount: 3, pageCount: 2, basedOnB64: "OLD=" });
  assert.deepEqual(next.selection, ["p0"], "p2 was cut off by the shorter recompile");
});
