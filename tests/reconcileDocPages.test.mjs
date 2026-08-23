import assert from "node:assert/strict";
import test from "node:test";
import { reconcileDocPages } from "../src/renderer/src/state/reconcileDocPages.ts";

const page = (id, srcId, pageIndex, extra = {}) => ({
  id,
  srcId,
  srcKind: srcId === "doc" ? "doc" : "pdf",
  pageIndex,
  rotation: 0,
  background: null,
  patches: [],
  ...extra
});

function reconcile(pages, previousPageCount, nextPageCount) {
  let id = 0;
  return reconcileDocPages({
    pages,
    docId: "doc",
    previousPageCount,
    nextPageCount,
    createId: () => `new-${++id}`
  });
}

test("preserves exact global order, interleaving, duplicates, and page metadata", () => {
  const pages = [
    page("d2", "doc", 2, { rotation: 90 }),
    page("p1", "pdf", 0),
    page("d0", "doc", 0),
    page("d0-copy", "doc", 0, { background: "#123456" }),
    page("p2", "pdf", 1)
  ];

  assert.deepEqual(reconcile(pages, 3, 3), pages);
});

test("does not resurrect a deliberately deleted page", () => {
  const pages = [page("d0", "doc", 0), page("d2", "doc", 2)];
  assert.deepEqual(reconcile(pages, 3, 3).map((item) => item.pageIndex), [0, 2]);
});

test("appends only genuinely new compiled pages after the final surviving doc page", () => {
  const pages = [page("d0", "doc", 0), page("p1", "pdf", 0), page("d1", "doc", 1), page("p2", "pdf", 1)];
  assert.deepEqual(reconcile(pages, 2, 4).map((item) => item.id), ["d0", "p1", "d1", "new-1", "new-2", "p2"]);
});

test("removes only references that no longer exist when a document shrinks", () => {
  const pages = [page("d2", "doc", 2), page("p1", "pdf", 0), page("d0", "doc", 0)];
  assert.deepEqual(reconcile(pages, 3, 2).map((item) => item.id), ["p1", "d0"]);
});

test("first compilation creates every page", () => {
  assert.deepEqual(reconcile([], 0, 3).map((item) => item.pageIndex), [0, 1, 2]);
});

test("an entirely deleted document stays absent when its page count is unchanged", () => {
  assert.deepEqual(reconcile([page("p1", "pdf", 0)], 3, 3).map((item) => item.id), ["p1"]);
});
