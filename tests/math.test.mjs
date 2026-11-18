import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Marked } from "marked";
import { mathExtension } from "../src/renderer/src/engine/math.ts";

const md = (src) => new Marked(mathExtension).parse(src, { async: false });

test("inline $…$ renders as MathML with a real superscript", () => {
  const html = md("El área es $(a + b)^2 = a^2 + 2ab + b^2$ siempre.");
  assert.match(html, /<math[\s>]/);
  assert.match(html, /<msup>/);
  assert.match(html, /siempre\.<\/p>/);
});

test("$$ block on its own lines renders as display MathML", () => {
  const html = md("Antes.\n\n$$\n(3a^m + 5a^{n+1})(3a^m - 5a^{n+1})\n$$\n\nDespués.");
  assert.match(html, /<math[^>]*display="block"/);
  assert.match(html, /<p>Antes\.<\/p>/);
  assert.match(html, /<p>Después\.<\/p>/);
});

test("$$ block on CRLF line breaks renders as display MathML", () => {
  const html = md("Antes.\r\n\r\n$$\r\n(3a^m + 5a^{n+1})(3a^m - 5a^{n+1})\r\n$$\r\n\r\nDespués.");
  assert.match(html, /<math[^>]*display="block"/);
  assert.match(html, /<p>Antes\.<\/p>/);
  assert.match(html, /<p>Después\.<\/p>/);
});

test("money amounts stay plain text", () => {
  for (const src of ["Cuesta $200 y $180.", "Entre $1,000 y $2,000 pesos.", "Pagó $25 y $5."]) {
    assert.doesNotMatch(md(src), /<math/, src);
  }
});

test("escaped dollar stays a literal dollar", () => {
  const html = md("Precio \\$5 por pieza.");
  assert.doesNotMatch(html, /<math/);
  assert.match(html, /\$5/);
});

test("code spans and fenced code keep their dollars literal", () => {
  assert.match(md("Escribe `$x^2$` así."), /<code>\$x\^2\$<\/code>/);
  const fenced = md("```text\n$a^2$ y $$\n```");
  assert.doesNotMatch(fenced, /<math/);
  assert.match(fenced, /\$a\^2\$/);
});

test("invalid TeX does not throw", () => {
  assert.doesNotThrow(() => md("Mal: $\\frac{1}{$ fin."));
});

// katex.css is KaTeX's own stylesheet with each font inlined as one woff2 data URL.
// A broken inlining once merged all faces into one rule and dropped `.katex{font:…}`:
// 2-row matrix parentheses stopped stretching and \neq printed as a box.
test("katex.css is the installed KaTeX stylesheet with all fonts inlined", () => {
  const strip = (css) => css.replace(/src:url\([^)]*\) format\("woff2"\)(?:,url\([^)]*\) format\("[a-z]+"\))*/g, "src:F");
  const asset = readFileSync(new URL("../src/renderer/src/assets/katex.css", import.meta.url), "utf8");
  const dist = readFileSync(new URL("../node_modules/katex/dist/katex.min.css", import.meta.url), "utf8");
  assert.equal(strip(asset), strip(dist));
  assert.equal(asset.match(/url\(data:font\/woff2;base64,/g)?.length, dist.match(/@font-face/g).length);
  assert.doesNotMatch(asset, /url\(fonts\//);
});

const display = (html) => (html.match(/<math[^>]*display="block"/g) ?? []).length;
const anyMath = (html) => (html.match(/<math/g) ?? []).length;

test("$$…$$ on one line is a display formula with no stray dollar", () => {
  for (const src of ["Antes.\n\n$$x^2 + y^2 = r^2$$\n\nDespués.", "Una línea: $$x^2 + y^2 = r^2$$ y sigue."]) {
    const html = md(src);
    assert.equal(display(html), 1, src);
    assert.doesNotMatch(html.replace(/<span class="katex[\s\S]*?<\/math>/g, ""), /\$/, src);
  }
});

test("$$ with content on its opening or closing line is a display formula", () => {
  for (const src of ["$$ x^* = 2\n$$", "$$\nx^* = 2 $$", "$$ a = 1 \\\\\n b = 2 $$\n\nTexto."]) {
    assert.equal(display(md(src)), 1, src);
  }
});

test("\\[…\\] is a display formula and \\(…\\) an inline one", () => {
  assert.equal(display(md("\\[\n\\frac{d}{dx} x^2 = 2x\n\\]")), 1);
  assert.equal(display(md("Corchetes: \\[ \\frac{d}{dx} x^2 = 2x \\] fin.")), 1);
  const inline = md("La pendiente \\(m = 2\\) es constante.");
  assert.equal(anyMath(inline), 1);
  assert.equal(display(inline), 0);
});

test("a formula never swallows a blank line, and code keeps its brackets", () => {
  assert.equal(anyMath(md("Cuesta $$ en total.\n\nOtro párrafo con $$ suelto.")), 0);
  assert.equal(anyMath(md("Usa `\\(x\\)` o:\n\n```\n\\[ y \\]\n$$z$$\n```")), 0);
});

test("two $$…$$ formulas on one line render as two formulas, never one broken formula", () => {
  const html = md("$$a+b$$ y $$c+d$$");
  assert.equal(display(html), 2);
  assert.doesNotMatch(html, /katex-error/);
});

test("a formula with absolute-value bars inside a table cell uses the GFM escape \\|", () => {
  const html = md("| Caso | Valor |\n|---|---|\n| absoluto | $\\|x\\|$ |\n");
  assert.equal(anyMath(html), 1);
  assert.match(html, /<annotation encoding="application\/x-tex">\|x\|<\/annotation>/);
});
