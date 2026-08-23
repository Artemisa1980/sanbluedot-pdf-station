import assert from "node:assert/strict";
import test from "node:test";
import { deserialize, serialize, validateProject } from "../src/renderer/src/engine/projectFile.ts";

const validProject = {
  version: 1,
  name: "Prueba",
  pageSize: "letter",
  margins: "compact",
  docs: [],
  pdfs: [{ id: "pdf-1", name: "source.pdf", bytesB64: "AA==" }],
  pages: [{
    id: "page-1",
    srcId: "pdf-1",
    srcKind: "pdf",
    pageIndex: 0,
    rotation: 0,
    background: null,
    patches: []
  }]
};

test("round-trips a valid project", () => {
  assert.deepEqual(deserialize(serialize(validProject)), validProject);
  assert.equal(validateProject(validProject), true);
});

test("rejects a page whose source does not exist", () => {
  const broken = structuredClone(validProject);
  broken.pages[0].srcId = "missing";
  assert.throws(() => deserialize(JSON.stringify(broken)), /estructura desconocida/);
});

test("rejects invalid nested patches before export", () => {
  const broken = structuredClone(validProject);
  broken.pages[0].patches.push({
    id: "patch-1",
    x: 0.9,
    y: 0,
    w: 0.2,
    h: 0.2,
    color: "red",
    text: "x",
    textColor: "#000000",
    fontSize: 10
  });
  assert.throws(() => deserialize(JSON.stringify(broken)), /estructura desconocida/);
});

test("rejects duplicate source and page identifiers", () => {
  const duplicateSource = structuredClone(validProject);
  duplicateSource.docs.push({
    id: "pdf-1",
    name: "chapter.md",
    kind: "md",
    content: "# Chapter",
    preset: "sanbluedot",
    compiledB64: null
  });
  assert.equal(validateProject(duplicateSource), false);

  const duplicatePage = structuredClone(validProject);
  duplicatePage.pages.push(structuredClone(duplicatePage.pages[0]));
  assert.equal(validateProject(duplicatePage), false);
});
