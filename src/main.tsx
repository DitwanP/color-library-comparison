import React from "react";
import { createRoot } from "react-dom/client";
import "@esri/calcite-components/main.css";
import { ColorLibraryComparison } from "./apps/theme-builder/comparison/comparison";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The app root element is missing.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ColorLibraryComparison />
  </React.StrictMode>
);
