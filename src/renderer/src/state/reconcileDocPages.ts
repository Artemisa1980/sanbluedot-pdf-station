import type { PageRef } from "../../../shared/types";

interface ReconcileDocPagesOptions {
  pages: PageRef[];
  docId: string;
  previousPageCount: number;
  nextPageCount: number;
  createId: () => string;
}

/**
 * Reconciles a freshly compiled document with the master page sequence.
 *
 * Existing references stay in their exact global positions, including duplicates
 * and references interleaved with other sources. Missing indices below the old
 * page count remain missing because the user may have deleted them deliberately.
 * Only genuinely new trailing indices are inserted after the document's final
 * surviving reference.
 */
export function reconcileDocPages({
  pages,
  docId,
  previousPageCount,
  nextPageCount,
  createId
}: ReconcileDocPagesOptions): PageRef[] {
  const safePreviousCount = Math.max(0, Math.trunc(previousPageCount));
  const safeNextCount = Math.max(0, Math.trunc(nextPageCount));
  const surviving = pages.filter((page) => page.srcId !== docId || page.pageIndex < safeNextCount);
  const represented = new Set(
    surviving.filter((page) => page.srcId === docId).map((page) => page.pageIndex)
  );

  const additions: PageRef[] = [];
  for (let pageIndex = safePreviousCount; pageIndex < safeNextCount; pageIndex += 1) {
    if (represented.has(pageIndex)) continue;
    additions.push({
      id: createId(),
      srcId: docId,
      srcKind: "doc",
      pageIndex,
      rotation: 0,
      background: null,
      patches: []
    });
  }

  if (additions.length === 0) return surviving;

  let insertionIndex = -1;
  for (let index = surviving.length - 1; index >= 0; index -= 1) {
    if (surviving[index].srcId === docId) {
      insertionIndex = index + 1;
      break;
    }
  }
  if (insertionIndex === -1) insertionIndex = surviving.length;

  return [
    ...surviving.slice(0, insertionIndex),
    ...additions,
    ...surviving.slice(insertionIndex)
  ];
}
