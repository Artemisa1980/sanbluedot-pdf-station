import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

// compile.ts uses Vite imports (`?raw` stylesheet, `?inline` fonts); this plugin mirrors them
const viteSuffixes = {
  name: "vite-suffixes",
  setup(b) {
    b.onResolve({ filter: /\?(raw|inline)$/ }, (a) => {
      const bare = a.path.replace(/\?(raw|inline)$/, "");
      const file = bare.startsWith(".") ? path.resolve(a.resolveDir, bare) : path.resolve("node_modules", bare);
      return { path: file, namespace: a.path.endsWith("?raw") ? "raw" : "inline" };
    });
    b.onLoad({ filter: /.*/, namespace: "raw" }, async (a) => ({ contents: await readFile(a.path, "utf8"), loader: "text" }));
    b.onLoad({ filter: /.*/, namespace: "inline" }, async (a) => ({
      contents: `export default "data:font/woff2;base64,${(await readFile(a.path)).toString("base64")}"`,
      loader: "js"
    }));
    // Thumbnails need a DOM; compile only calls evictSource from it
    b.onResolve({ filter: /\/thumbnails$/ }, () => ({ path: "thumbnails", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const evictSource = () => {};", loader: "js" }));
  }
};

let compile;
let staleness;
let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pdf-station-compile-"));
  const bundle = async (entry, name) => {
    const out = path.join(workDir, name);
    await build({ entryPoints: [path.resolve(entry)], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent", plugins: [viteSuffixes] });
    return import(pathToFileURL(out).href);
  };
  compile = await bundle("src/renderer/src/engine/compile.ts", "compile.mjs");
  staleness = await bundle("src/renderer/src/engine/staleness.ts", "staleness.mjs");
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

const doc = (extra = {}) => ({ id: "d", name: "a.md", kind: "md", content: "# A\n\n$x^2$", preset: "sanbluedot", compiledB64: null, ...extra });
const project = { pageSize: "letter", margins: "compact" };

test("compiled HTML keeps scripts and network out and embeds the code font", () => {
  const html = compile.buildDocHtml(doc());
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /@font-face\{font-family:"Fira Code";[^}]*data:font\/woff2;base64,/, "full Fira Code is embedded for code blocks");
  assert.match(html, /--mono:\s+"Fira Code"/);
  assert.match(html, /<math/, "Markdown formulas become MathML");
});

test("a preset embeds the extra typefaces its headings use", () => {
  const html = compile.buildDocHtml(doc({ preset: "sage" }));
  assert.match(html, /font-family:"Lora"/, "body font of the preset");
  assert.match(html, /font-family:"Instrument Serif"/, "heading font listed in fontIds");
  assert.equal((html.match(/@font-face\{font-family:"Fira Code";font-style:normal;font-weight:400/g) ?? []).length, 1, "faces are not repeated");
});

test("HTML documents keep dollar signs as written", () => {
  const html = compile.buildDocHtml(doc({ kind: "html", content: "<p>$x^2$</p>" }));
  assert.match(html, /<p>\$x\^2\$<\/p>/);
});

test("a compiled document is stale when its text or style changes after compiling", () => {
  const source = doc({ compiledB64: "AA==" });
  const fresh = { ...source, compiledSig: staleness.docSignature(source, project) };
  assert.equal(staleness.isStale(fresh, project), false);
  assert.equal(staleness.isStale({ ...fresh, content: "# B" }, project), true, "edited text");
  assert.equal(staleness.isStale({ ...fresh, preset: "maquina" }, project), true, "other preset");
  assert.equal(staleness.isStale(fresh, { ...project, margins: "apa" }), true, "other margins");
  assert.equal(staleness.isStale({ ...source, compiledSig: undefined }, project), true, "saved before v1.10: recompile once");
  assert.equal(staleness.isStale(doc(), project), false, "never compiled: nothing to refresh");
});

test("user messages drop Electron's English IPC prefix", async () => {
  const { cleanErrorText } = await import("../src/renderer/src/engine/errorText.ts");
  assert.equal(
    cleanErrorText("Error invoking remote method 'station:htmlToPdf': Error: La compilación tardó más de 2 minutos y se canceló."),
    "La compilación tardó más de 2 minutos y se canceló."
  );
  assert.equal(cleanErrorText("Proyecto guardado."), "Proyecto guardado.");
});
