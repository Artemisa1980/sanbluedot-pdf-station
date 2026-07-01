import { contextBridge, ipcRenderer } from "electron";

const api = {
  importPdfDialog: () => ipcRenderer.invoke("station:importPdfDialog"),
  exportPdfDialog: (defaultName: string, bytesB64: string) =>
    ipcRenderer.invoke("station:exportPdfDialog", defaultName, bytesB64),
  htmlToPdf: (html: string, opts: unknown) => ipcRenderer.invoke("station:htmlToPdf", html, opts),
  saveProjectDialog: (json: string, currentPath: string | null) =>
    ipcRenderer.invoke("station:saveProjectDialog", json, currentPath),
  openProjectDialog: () => ipcRenderer.invoke("station:openProjectDialog")
};

contextBridge.exposeInMainWorld("station", api);
