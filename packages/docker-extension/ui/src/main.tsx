import React from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { DockerMuiV6ThemeProvider } from "@docker/docker-mui-theme";

import { App } from './App';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DockerMuiV6ThemeProvider>
      <CssBaseline />
      <App />
    </DockerMuiV6ThemeProvider>
  </React.StrictMode>
);
