import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "../apps-script/build",
    emptyOutDir: true,
    lib: {
      entry: "src/main.js",
      name: "OnboardingClient",
      formats: ["iife"],
      fileName: () => "Client.js",
      cssFileName: "Styles"
    }
  }
});
