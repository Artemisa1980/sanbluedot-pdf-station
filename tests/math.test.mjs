import assert from "node:assert/strict";
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
