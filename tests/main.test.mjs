import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

let guards;
let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-main-"));
  const out = path.join(workDir, "guards.mjs");
  await build({ entryPoints: [path.resolve("src/main/guards.ts")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
  guards = await import(pathToFileURL(out).href);
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test("projectPath accepts only absolute .sbstation paths", () => {
  assert.equal(guards.projectPath("/Users/a/tesis.sbstation"), "/Users/a/tesis.sbstation");
  assert.equal(guards.projectPath("/Users/a/../a/x.SBSTATION"), "/Users/a/x.SBSTATION");
  assert.equal(guards.projectPath("relativo.sbstation"), null);
  assert.equal(guards.projectPath("/Users/a/notas.txt"), null);
  assert.equal(guards.projectPath(42), null);
});

test("a recovery draft only keeps a path the user already chose", () => {
  const chosen = "/Users/a/tesis.sbstation";
  assert.equal(guards.draftFilePath(chosen, chosen), chosen);
  assert.equal(guards.draftFilePath("/Users/a/otro.sbstation", chosen), null, "an unregistered path never becomes a dialog-free save target");
  assert.equal(guards.draftFilePath(chosen, undefined), null);
  assert.equal(guards.draftFilePath(null, chosen), null);
});

test("atomicWrite replaces the target and leaves no temporary file", async () => {
  const target = path.join(workDir, "p.sbstation");
  await writeFile(target, "viejo");
  await Promise.all([guards.atomicWrite(target, "nuevo-a"), guards.atomicWrite(target, "nuevo-b")]);
  assert.match(await readFile(target, "utf8"), /^nuevo-[ab]$/, "concurrent writes never leave a torn file");
  assert.deepEqual((await readdir(workDir)).filter((f) => f.endsWith(".tmp")), []);
});

test("atomicWrite keeps the old target when the write fails", async () => {
  const target = path.join(workDir, "intacto.sbstation");
  await writeFile(target, "original");
  await assert.rejects(guards.atomicWrite(path.join(workDir, "no-existe", "x.sbstation"), "dato"));
  assert.equal(await readFile(target, "utf8"), "original");
});

test("isPdfBytes checks the PDF header", () => {
  assert.equal(guards.isPdfBytes(Buffer.from("%PDF-1.7\n...")), true);
  assert.equal(guards.isPdfBytes(Buffer.from("<html>")), false);
  assert.equal(guards.isPdfBytes(Buffer.alloc(0)), false);
});

test("sanitizeMyStyles drops malformed entries", () => {
  const ok = { id: "a", label: "Mío", baseId: "sanbluedot", style: {} };
  assert.deepEqual(guards.sanitizeMyStyles([ok, { id: 1 }, null, "x"]), [ok]);
  assert.deepEqual(guards.sanitizeMyStyles({ not: "a list" }), []);
});

test("the packaged app never uses the dev server URL", () => {
  const env = { ELECTRON_RENDERER_URL: "http://localhost:5173" };
  assert.equal(guards.devRendererUrl(true, env), null, "packaged → offline file:// renderer, network blocked");
  assert.equal(guards.devRendererUrl(false, env), "http://localhost:5173");
  assert.equal(guards.devRendererUrl(false, {}), null, "built preview without dev server stays blocked");
  for (const scheme of ["http", "https", "ws", "wss", "ftp"]) {
    assert.ok(guards.NETWORK_URL_PATTERNS.includes(`${scheme}://*/*`), `${scheme} is cancelled`);
  }
});

test("the compile limiter never runs more than the limit at once and keeps order", async () => {
  const run = guards.createLimiter(2);
  let active = 0;
  let peak = 0;
  const order = [];
  const task = (n) => run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    order.push(n);
    active -= 1;
    return n;
  });
  const results = await Promise.all([1, 2, 3, 4, 5].map(task));
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.equal(order.length, 5);
});

test("the draft queue runs operations one after another, even after a failure", async () => {
  const enqueue = guards.createSerialQueue();
  const log = [];
  const slow = enqueue(async () => {
    await new Promise((r) => setTimeout(r, 10));
    log.push("write");
  });
  const failing = enqueue(async () => {
    log.push("fail");
    throw new Error("x");
  });
  const clear = enqueue(async () => log.push("clear"));
  await slow;
  await assert.rejects(failing);
  await clear;
  assert.deepEqual(log, ["write", "fail", "clear"], "a clear never overtakes a write in flight");
});
