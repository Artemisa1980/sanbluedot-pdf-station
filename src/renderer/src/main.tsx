import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/instrument-serif/400.css";
import "./styles/app.css";
import App from "./App";
import { StationProvider } from "./state/store";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StationProvider>
      <App />
    </StationProvider>
  </React.StrictMode>
);
