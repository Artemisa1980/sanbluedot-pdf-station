import { contextBridge, ipcRenderer } from "electron";

const api = {
  importFilesDialog: () => ipcRenderer.invoke("station:importFilesDialog"),
  pickImagesDialog: () => ipcRenderer.invoke("station:pickImagesDialog"),
  exportPdfDialog: (defaultName: string, bytesB64: string) =>
    ipcRenderer.invoke("station:exportPdfDialog", defaultName, bytesB64),
  htmlToPdf: (html: string, opts: unknown) => ipcRenderer.invoke("station:htmlToPdf", html, opts),
  saveProjectDialog: (json: string, currentPath: string | null, suggestedName?: string) =>
    ipcRenderer.invoke("station:saveProjectDialog", json, currentPath, suggestedName),
  openProjectDialog: () => ipcRenderer.invoke("station:openProjectDialog"),
  setDirty: (value: boolean) => ipcRenderer.send("station:setDirty", value)
};

contextBridge.exposeInMainWorld("station", api);
