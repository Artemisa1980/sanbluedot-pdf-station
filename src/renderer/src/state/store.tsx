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
  | { type: "loadProject"; project: StationProject }
  | { type: "addPdf"; pdf: ImportedPdf; pageRefs: PageRef[] }
  | { type: "addDoc"; doc: SourceDoc }
  | { type: "updateDoc"; docId: string; patch: Partial<SourceDoc> }
  | { type: "setDocPages"; docId: string; compiledB64: string; pageCount: number }
  | { type: "removeSource"; srcId: string }
  | { type: "insertPages"; pageRefs: PageRef[]; atIndex: number }
  | { type: "removePages"; ids: string[] }
  | { type: "duplicatePages"; ids: string[] }
  | { type: "reorderPage"; fromIndex: number; toIndex: number }
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
}

function rotateBy(r: Rotation, delta: 90 | -90): Rotation {
  return ((((r + delta) % 360) + 360) % 360) as Rotation;
}

function mapPages(state: StationState, ids: string[], fn: (p: PageRef) => PageRef): StationState {
  const wanted = new Set(ids);
  return {
    ...state,
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
      return { project: emptyProject(), selection: [] };

    case "loadProject":
      return { project: action.project, selection: [] };

    case "addPdf":
      return {
        ...state,
        project: {
          ...project,
          pdfs: [...project.pdfs, action.pdf],
          pages: [...project.pages, ...action.pageRefs]
        }
      };

    case "addDoc":
      return { ...state, project: { ...project, docs: [...project.docs, action.doc] } };

    case "updateDoc":
      return {
        ...state,
        project: {
          ...project,
          docs: project.docs.map((d) => (d.id === action.docId ? { ...d, ...action.patch } : d))
        }
      };

    case "setDocPages": {
      // Reemplaza las páginas del doc conservando la posición de la primera aparición
      const oldIndex = project.pages.findIndex((p) => p.srcId === action.docId);
      const rest = project.pages.filter((p) => p.srcId !== action.docId);
      const fresh: PageRef[] = Array.from({ length: action.pageCount }, (_, i) => ({
        id: newId(),
        srcId: action.docId,
        srcKind: "doc",
        pageIndex: i,
        rotation: 0,
        background: null,
        patches: []
      }));
      const at = oldIndex === -1 ? rest.length : Math.min(oldIndex, rest.length);
      const pages = [...rest.slice(0, at), ...fresh, ...rest.slice(at)];
      return {
        selection: [],
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
        project: {
          ...project,
          docs: project.docs.filter((d) => d.id !== action.srcId),
          pdfs: project.pdfs.filter((p) => p.id !== action.srcId),
          pages
        }
      };
    }

    case "insertPages": {
      const at = Math.max(0, Math.min(action.atIndex, project.pages.length));
      const pages = [...project.pages.slice(0, at), ...action.pageRefs, ...project.pages.slice(at)];
      return { ...state, project: { ...project, pages } };
    }

    case "removePages": {
      const gone = new Set(action.ids);
      return {
        selection: state.selection.filter((id) => !gone.has(id)),
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
      return { selection: newIds, project: { ...project, pages } };
    }

    case "reorderPage": {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= project.pages.length ||
        toIndex < 0 ||
        toIndex > project.pages.length
      ) {
        return state;
      }
      const pages = [...project.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
      return { ...state, project: { ...project, pages } };
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
      return { ...state, project: { ...project, pageSize: action.value } };

    case "setMargins":
      return { ...state, project: { ...project, margins: action.value } };

    case "setName":
      return { ...state, project: { ...project, name: action.value } };

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
    selection: [] as string[]
  }));
  return <StationContext.Provider value={{ state, dispatch }}>{children}</StationContext.Provider>;
}

export function useStation() {
  const ctx = useContext(StationContext);
  if (!ctx) throw new Error("useStation debe usarse dentro de <StationProvider>");
  return { project: ctx.state.project, selection: ctx.state.selection, dispatch: ctx.dispatch };
}
