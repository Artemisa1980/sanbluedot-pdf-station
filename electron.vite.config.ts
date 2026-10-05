import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json") as { version: string };

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      tailwindcss(),
      {
        // El servidor de desarrollo necesita localhost; la app empaquetada no se conecta a nada
        name: "production-csp",
        apply: "build",
        transformIndexHtml: (html: string) => html.replace(" ws://localhost:* http://localhost:*", "")
      }
    ]
  }
});
