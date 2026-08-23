import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type {
  ImportedPdf,
  MarginPreset,
  PageRef,
  PageSize,
  Patch,
  Rotation,
  SourceDoc,
  StationProject
} from "../../../shared/types";
import { reconcileDocPages } from "./reconcileDocPages";

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyProject(): StationProject {
  return {
    version: 1,
    name: "Sin título",
    pageSize: "letter",
    margins: "compact",
    docs: [],
    pdfs: [],
    pages: []
  };
}

export type Action =
  | { type: "newProject" }
  | { type: "loadProject"; project: StationProject; dirty?: boolean }
  | { type: "markSaved" }
  | { type: "addPdf"; pdf: ImportedPdf; pageRefs: PageRef[] }
  | { type: "addDoc"; doc: SourceDoc }
  | { type: "updateDoc"; docId: string; patch: Partial<SourceDoc> }
  | {
      type: "setDocPages";
      docId: string;
      compiledB64: string;
      previousPageCount: number;
      pageCount: number;
    }
  | { type: "removeSource"; srcId: string }
  | { type: "moveSource"; srcId: string; dir: -1 | 1 }
  | { type: "insertPages"; pageRefs: PageRef[]; atIndex: number }
  | { type: "removePages"; ids: string[] }
  | { type: "duplicatePages"; ids: string[] }
  | { type: "movePages"; ids: string[]; toIndex: number }
  | { type: "rotatePages"; ids: string[]; delta: 90 | -90 }
  | { type: "setBackground"; ids: string[]; color: string | null }
  | { type: "addPatch"; pageId: string; patch: Patch }
  | { type: "updatePatch"; pageId: string; patch: Patch }
  | { type: "removePatch"; pageId: string; patchId: string }
  | { type: "setPageSize"; value: PageSize }
  | { type: "setMargins"; value: MarginPreset }
  | { type: "setName"; value: string }
  | { type: "select"; ids: string[] }
  | { type: "toggleSelect"; id: string };

export interface StationState {
  project: StationProject;
  selection: string[]; // ids de PageRef seleccionadas, en orden de selección
  dirty: boolean; // hay cambios sin guardar — alimenta el aviso de cierre y las confirmaciones
}

function rotateBy(r: Rotation, delta: 90 | -90): Rotation {
  return ((((r + delta) % 360) + 360) % 360) as Rotation;
}

function mapPages(state: StationState, ids: string[], fn: (p: PageRef) => PageRef): StationState {
  const wanted = new Set(ids);
  return {
    ...state,
    dirty: true,
    project: {
      ...state.project,
      pages: state.project.pages.map((p) => (wanted.has(p.id) ? fn(p) : p))
    }
  };
}

function reducer(state: StationState, action: Action): StationState {
  const { project } = state;

  switch (action.type) {
    case "newProject":
      return { project: emptyProject(), selection: [], dirty: false };

    case "loadProject":
      // dirty:true = borrador de recuperación restaurado (aún no vive en un .sbstation guardado)
      return { project: action.project, selection: [], dirty: action.dirty ?? false };

    case "markSaved":
      return state.dirty ? { ...state, dirty: false } : state;

    case "addPdf":
      return {
        ...state,
        dirty: true,
        project: {
          ...project,
          pdfs: [...project.pdfs, action.pdf],
          pages: [...project.pages, ...action.pageRefs]
        }
      };

    case "addDoc":
      return { ...state, dirty: true, project: { ...project, docs: [...project.docs, action.doc] } };

    case "updateDoc":
      return {
        ...state,
        dirty: true,
        project: {
          ...project,
          docs: project.docs.map((d) => (d.id === action.docId ? { ...d, ...action.patch } : d))
        }
      };

    case "setDocPages": {
      const pages = reconcileDocPages({
        pages: project.pages,
        docId: action.docId,
        previousPageCount: action.previousPageCount,
        nextPageCount: action.pageCount,
        createId: newId
      });
      const keep = new Set(pages.map((p) => p.id));
      return {
        selection: state.selection.filter((id) => keep.has(id)),
        dirty: true,
        project: {
          ...project,
          docs: project.docs.map((d) =>
            d.id === action.docId ? { ...d, compiledB64: action.compiledB64 } : d
          ),
          pages
        }
      };
    }

    case "removeSource": {
      const pages = project.pages.filter((p) => p.srcId !== action.srcId);
      const keep = new Set(pages.map((p) => p.id));
      return {
        selection: state.selection.filter((id) => keep.has(id)),
        dirty: true,
        project: {
          ...project,
          docs: project.docs.filter((d) => d.id !== action.srcId),
          pdfs: project.pdfs.filter((p) => p.id !== action.srcId),
          pages
        }
      };
    }

    case "moveSource": {
      // Mueve la fuente completa (todas sus páginas, como capítulo) en el orden del maestro.
      // Orden de fuentes = primera aparición; al mover se consolidan sus páginas en bloque.
      const order: string[] = [];
      for (const p of project.pages) if (!order.includes(p.srcId)) order.push(p.srcId);
      const idx = order.indexOf(action.srcId);
      const to = idx + action.dir;
      if (idx === -1 || to < 0 || to >= order.length) return state;
      [order[idx], order[to]] = [order[to], order[idx]];
      const pages = order.flatMap((srcId) => project.pages.filter((p) => p.srcId === srcId));
      return { ...state, dirty: true, project: { ...project, pages } };
    }

    case "insertPages": {
      const at = Math.max(0, Math.min(action.atIndex, project.pages.length));
      const pages = [...project.pages.slice(0, at), ...action.pageRefs, ...project.pages.slice(at)];
      return { ...state, dirty: true, project: { ...project, pages } };
    }

    case "removePages": {
      const gone = new Set(action.ids);
      return {
        selection: state.selection.filter((id) => !gone.has(id)),
        dirty: true,
        project: { ...project, pages: project.pages.filter((p) => !gone.has(p.id)) }
      };
    }

    case "duplicatePages": {
      const wanted = new Set(action.ids);
      const pages: PageRef[] = [];
      const newIds: string[] = [];
      for (const p of project.pages) {
        pages.push(p);
        if (wanted.has(p.id)) {
          const copy: PageRef = {
            ...p,
            id: newId(),
            patches: p.patches.map((patch) => ({ ...patch, id: newId() }))
          };
          newIds.push(copy.id);
          pages.push(copy);
        }
      }
      return { selection: newIds, dirty: true, project: { ...project, pages } };
    }

    case "movePages": {
      // Mueve un bloque (en su orden visual actual) a toIndex — índice referido al array ANTES de extraer el bloque
      const wanted = new Set(action.ids);
      const moving = project.pages.filter((p) => wanted.has(p.id));
      if (moving.length === 0) return state;
      const rest = project.pages.filter((p) => !wanted.has(p.id));
      let at = 0;
      const limit = Math.max(0, Math.min(action.toIndex, project.pages.length));
      for (let i = 0; i < limit; i++) {
        if (!wanted.has(project.pages[i].id)) at++;
      }
      const pages = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
      return { ...state, dirty: true, project: { ...project, pages } };
    }

    case "rotatePages":
      return mapPages(state, action.ids, (p) => ({ ...p, rotation: rotateBy(p.rotation, action.delta) }));

    case "setBackground":
      return mapPages(state, action.ids, (p) => ({ ...p, background: action.color }));

    case "addPatch":
      return mapPages(state, [action.pageId], (p) => ({ ...p, patches: [...p.patches, action.patch] }));

    case "updatePatch":
      return mapPages(state, [action.pageId], (p) => ({
        ...p,
        patches: p.patches.map((x) => (x.id === action.patch.id ? action.patch : x))
      }));

    case "removePatch":
      return mapPages(state, [action.pageId], (p) => ({
        ...p,
        patches: p.patches.filter((x) => x.id !== action.patchId)
      }));

    case "setPageSize":
      return { ...state, dirty: true, project: { ...project, pageSize: action.value } };

    case "setMargins":
      return { ...state, dirty: true, project: { ...project, margins: action.value } };

    case "setName":
      return { ...state, dirty: true, project: { ...project, name: action.value } };

    case "select":
      return { ...state, selection: action.ids };

    case "toggleSelect":
      return {
        ...state,
        selection: state.selection.includes(action.id)
          ? state.selection.filter((x) => x !== action.id)
          : [...state.selection, action.id]
      };
  }
}

const StationContext = createContext<{ state: StationState; dispatch: Dispatch<Action> } | null>(null);

export function StationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    project: emptyProject(),
    selection: [] as string[],
    dirty: false
  }));
  return <StationContext.Provider value={{ state, dispatch }}>{children}</StationContext.Provider>;
}

export function useStation() {
  const ctx = useContext(StationContext);
  if (!ctx) throw new Error("useStation debe usarse dentro de <StationProvider>");
  return {
    project: ctx.state.project,
    selection: ctx.state.selection,
    dirty: ctx.state.dirty,
    dispatch: ctx.dispatch
  };
}
