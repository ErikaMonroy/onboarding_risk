/**
 * Inserta los artefactos compilados de Vite en los parciales de Google HTML Service.
 * La fuente editable vive en frontend/src; estos HTML se regeneran cada vez que se compila.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolver rutas relativas al propio script para que funcione desde cualquier carpeta.
const here = path.dirname(fileURLToPath(import.meta.url));
const appScriptDir = path.resolve(here, "..");
const buildDir = path.join(appScriptDir, "build");

// Vite produce estos dos archivos; cada uno se incorpora en su HTML de Apps Script.
const styles = await readFile(path.join(buildDir, "Styles.css"), "utf8");
const client = await readFile(path.join(buildDir, "Client.js"), "utf8");

// Los comentarios externos sobreviven a la minificación y orientan a quien abre GAS.
const stylesHtml = [
  "<!-- Generado desde frontend/src/styles.css por pnpm build. No editar a mano. -->",
  "<style>", styles, "</style>"
].join("");
const clientHtml = [
  "<!-- Generado desde frontend/src/main.js y model-input.js por pnpm build. -->",
  "<!-- Este bundle presenta/captura datos; la inferencia vive en apps-script/Model.gs. -->",
  "<script>", client, "</script>"
].join("");

// Bloquear el cierre de etiqueta inyectado desde JS antes de insertarlo en <script>.
if (/<\/script/i.test(client)) {
  throw new Error("Client.js contiene un cierre de script que no se puede embeber de forma segura.");
}

await writeFile(path.join(appScriptDir, "Styles.html"), stylesHtml, "utf8");
await writeFile(path.join(appScriptDir, "Client.html"), clientHtml, "utf8");
console.log("Vite compilado y embebido en Styles.html y Client.html de Apps Script.");
