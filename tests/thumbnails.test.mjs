import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { build } from "esbuild";

let api;
let workDir;

// Controlled stand-in for PDF.js and the canvas: the tests decide what opens, renders or fails
const harness = {
  opened: 0,
  destroyed: 0,
  renders: 0,
  openImpl: null,
  renderImpl: null,
  urlImpl: null
};

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-thumbs-"));
  const stubPath = path.join(workDir, "pdfjs-stub.mjs");
  await writeFile(
    stubPath,
    `export const GlobalWorkerOptions = {};
export function getDocument({ data }) {
  return { promise: globalThis.__pdfHarness.openImpl(data) };
}
`
  );
  const entryPath = path.join(workDir, "entry.ts");
  const engine = path.resolve("src/renderer/src/engine");
  await writeFile(
    entryPath,
    `export * from ${JSON.stringify(path.join(engine, "thumbnails.ts"))};
export * from ${JSON.stringify(path.join(engine, "bytesCache.ts"))};
`
  );
  const bundlePath = path.join(workDir, "entry.mjs");
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    alias: { "pdfjs-dist": stubPath },
    logLevel: "silent"
  });
  globalThis.__pdfHarness = harness;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({}),
      toDataURL: () => harness.urlImpl()
    })
  };
  api = await import(pathToFileURL(bundlePath).href);
});

after(async () => {
  delete globalThis.__pdfHarness;
  delete globalThis.window;
  delete globalThis.document;
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

function fakeDoc() {
  return {
    numPages: 3,
    destroy() {
      harness.destroyed++;
    },
    getPage: async () => ({
      getViewport: ({ scale }) => ({ width: 100 * scale, height: 140 * scale }),
      render: () => ({
        promise: (async () => {
          harness.renders++;
          await harness.renderImpl();
        })()
      })
    })
  };
}

beforeEach(() => {
  harness.opened = 0;
  harness.destroyed = 0;
  harness.renders = 0;
  harness.openImpl = async () => {
    harness.opened++;
    return fakeDoc();
  };
  harness.renderImpl = async () => {};
  harness.urlImpl = () => "data:image/png;base64,AAAA";
});

let counter = 0;
const uid = () => `src-${++counter}`;
/** Distinct, non-trivial bytes per `seed` so the content signature differs. */
const pdfBytes = (seed) => Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + seed) % 251);

test("a thumbnail that failed to render is retried on the next request instead of replaying the failure", async () => {
  const id = uid();
  const bytes = pdfBytes(1);
  let fail = true;
  harness.renderImpl = async () => {
    if (fail) throw new Error("render exploded");
  };
  await assert.rejects(api.renderPageDataUrl(id, bytes, 0, 150), /render exploded/);
  assert.equal(api.thumbnailCacheStats().thumbnails, 0, "a failure must not stay cached");
  fail = false;
  const url = await api.renderPageDataUrl(id, bytes, 0, 150);
  assert.match(url, /^data:image\/png/);
  assert.equal(harness.renders, 2, "the second request rendered again");
  assert.equal(api.thumbnailCacheStats().thumbnails, 1);
  api.evictSource(id);
});

test("a PDF that failed to open is opened again on the next request", async () => {
  const id = uid();
  const bytes = pdfBytes(2);
  let fail = true;
  harness.openImpl = async () => {
    harness.opened++;
    if (fail) throw new Error("bad pdf");
    return fakeDoc();
  };
  await assert.rejects(api.getPageCount(id, bytes), /bad pdf/);
  fail = false;
  assert.equal(await api.getPageCount(id, bytes), 3);
  assert.equal(harness.opened, 2);
  api.evictSource(id);
});

test("the thumbnail cache is bounded by total bytes, not by entry count", async () => {
  const id = uid();
  const bytes = pdfBytes(3);
  const big = "data:image/png;base64," + "A".repeat(1024 * 1024); // ~1 MB each
  harness.urlImpl = () => big;
  for (let page = 0; page < 80; page++) await api.renderPageDataUrl(id, bytes, page, 150);
  const stats = api.thumbnailCacheStats();
  assert.ok(stats.bytes <= 48 * 1024 * 1024 + big.length, `kept ${stats.bytes} bytes`);
  assert.ok(stats.thumbnails < 80, "oldest entries were evicted");
  const rendersBefore = harness.renders;
  await api.renderPageDataUrl(id, bytes, 79, 150); // newest: still cached
  assert.equal(harness.renders, rendersBefore);
  await api.renderPageDataUrl(id, bytes, 0, 150); // oldest: evicted, renders again
  assert.equal(harness.renders, rendersBefore + 1);
  api.evictSource(id);
  assert.equal(api.thumbnailCacheStats().bytes, 0);
});

test("a source id with new content never serves the thumbnails or document of the old content", async () => {
  const id = uid();
  const oldBytes = pdfBytes(10);
  const newBytes = pdfBytes(20);
  harness.urlImpl = () => "data:image/png;base64,OLD";
  assert.equal(await api.renderPageDataUrl(id, oldBytes, 0, 150), "data:image/png;base64,OLD");
  harness.urlImpl = () => "data:image/png;base64,NEW";
  assert.equal(await api.renderPageDataUrl(id, newBytes, 0, 150), "data:image/png;base64,NEW");
  assert.equal(harness.opened, 2, "the new content opened its own document");
  assert.equal(api.thumbnailCacheStats().thumbnails, 1, "the old content's thumbnails were purged");
  await new Promise((r) => setImmediate(r));
  assert.equal(harness.destroyed, 1, "the old document was destroyed");
  api.evictSource(id);
});

test("PDF.js documents are capped and the least recently used are destroyed", async () => {
  const ids = Array.from({ length: 30 }, () => uid());
  for (const id of ids) await api.getPageCount(id, pdfBytes(5));
  await new Promise((r) => setImmediate(r));
  const stats = api.thumbnailCacheStats();
  assert.ok(stats.docs <= 16, `${stats.docs} documents kept`);
  assert.ok(harness.destroyed >= 14, `${harness.destroyed} destroyed`);
  for (const id of ids) api.evictSource(id);
  assert.equal(api.thumbnailCacheStats().docs, 0);
});

test("a document with work in flight is not destroyed by the cap", async () => {
  const busy = uid();
  let release;
  harness.renderImpl = () => new Promise((r) => (release = r));
  const pending = api.renderPageDataUrl(busy, pdfBytes(6), 0, 150);
  await new Promise((r) => setImmediate(r));
  harness.renderImpl = async () => {};
  const others = Array.from({ length: 30 }, () => uid());
  for (const id of others) await api.getPageCount(id, pdfBytes(7));
  const destroyedBefore = harness.destroyed;
  release();
  await pending; // would reject if its document had been destroyed underneath it
  assert.ok(destroyedBefore >= 1);
  for (const id of [busy, ...others]) api.evictSource(id);
});

test("bytesFor never serves the old bytes for a source whose base64 changed", () => {
  const id = uid();
  const a = Buffer.from("first compiled pdf").toString("base64");
  const b = Buffer.from("second compiled pdf!").toString("base64");
  assert.equal(Buffer.from(api.bytesFor(id, a)).toString(), "first compiled pdf");
  // No evict in between: eviction can arrive before the store receives the new PDF
  assert.equal(Buffer.from(api.bytesFor(id, b)).toString(), "second compiled pdf!");
  const first = api.bytesFor(id, b);
  assert.equal(api.bytesFor(id, b), first, "the same content is decoded only once");
  api.evictBytes(id);
});

test("same-length content that differs only in the middle gets new bytes and a new thumbnail key", () => {
  // Over 8 KB with identical head and tail: a partial sample used to treat both as one PDF
  const head = "H".repeat(6000);
  const tail = "T".repeat(6000);
  const a = Buffer.from(`${head}middle-AAAA${tail}`);
  const b = Buffer.from(`${head}middle-BBBB${tail}`);
  assert.equal(a.length, b.length);
  assert.notEqual(api.bytesSignature(new Uint8Array(a)), api.bytesSignature(new Uint8Array(b)));
  const id = `same-length-${Math.random()}`;
  assert.match(Buffer.from(api.bytesFor(id, a.toString("base64"))).toString(), /AAAA/);
  assert.match(Buffer.from(api.bytesFor(id, b.toString("base64"))).toString(), /BBBB/);
});
