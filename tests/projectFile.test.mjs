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

test("repairs sizes of 0 or below saved before v1.10 instead of rejecting the project", () => {
  const legacy = structuredClone(validProject);
  legacy.docs.push({
    id: "doc-1", name: "a.md", kind: "md", content: "# A", preset: "sanbluedot", compiledB64: null,
    style: { fontId: "charter", fontSizePt: -3, lineHeight: 0, bgColor: "#ffffff", textColor: "#232a3a", thBg: "#16213e", thText: "#ffffff" }
  });
  legacy.pages[0].patches.push({ id: "patch-1", x: 0, y: 0, w: 0.5, h: 0.5, color: "#ffffff", text: "", textColor: "#000000", fontSize: 0 });
  const opened = deserialize(JSON.stringify(legacy));
  assert.equal(opened.docs[0].style.fontSizePt, 9.5);
  assert.equal(opened.docs[0].style.lineHeight, 1.4);
  assert.equal(opened.pages[0].patches[0].fontSize, 11);
});

test("accepts the optional tint flag and rejects a non-boolean one", () => {
  const tinted = structuredClone(validProject);
  tinted.pages[0].background = "#f4e4e1";
  tinted.pages[0].tint = true;
  assert.equal(deserialize(JSON.stringify(tinted)).pages[0].tint, true);
  tinted.pages[0].tint = "yes";
  assert.throws(() => deserialize(JSON.stringify(tinted)), /estructura desconocida/);
});

test("accepts the optional compiled signature and rejects a non-string one", () => {
  const withDoc = structuredClone(validProject);
  withDoc.docs.push({ id: "doc-1", name: "a.md", kind: "md", content: "# A", preset: "sanbluedot", compiledB64: "AA==", compiledSig: "sig" });
  assert.equal(deserialize(JSON.stringify(withDoc)).docs[0].compiledSig, "sig");
  withDoc.docs[0].compiledSig = 7;
  assert.throws(() => deserialize(JSON.stringify(withDoc)), /estructura desconocida/);
});
