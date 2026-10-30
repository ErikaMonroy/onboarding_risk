import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "../apps-script/build",
    emptyOutDir: true,
    // Los HTML de Apps Script se inspeccionan y mantienen directamente en el editor.
    // Conservamos el formato del bundle para que Client.html y Styles.html sean legibles.
    minify: false,
    cssMinify: false,
    lib: {
      entry: "src/main.js",
      name: "OnboardingClient",
      formats: ["iife"],
      fileName: () => "Client.js",
      cssFileName: "Styles"
    }
  }
});
