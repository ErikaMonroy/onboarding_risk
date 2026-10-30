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

/**
 * Agrega saltos e indentación al CSS compilado de Tailwind.
 * El generador entrega reglas válidas en una línea; este formateador sencillo
 * conserva strings, comentarios y paréntesis sin reescribir los valores CSS.
 */
function formatCss(css) {
  let output = "";
  let depth = 0;
  let quote = "";
  let comment = false;
  let parens = 0;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const next = css[i + 1];

    if (comment) {
      output += char;
      if (char === "*" && next === "/") {
        output += next;
        i++;
        comment = false;
      }
      continue;
    }

    if (quote) {
      output += char;
      if (char === "\\") output += css[++i] || "";
      else if (char === quote) quote = "";
      continue;
    }

    if (char === "/" && next === "*") {
      output += "/*";
      i++;
      comment = true;
    } else if (char === "\"" || char === "'") {
      quote = char;
      output += char;
    } else if (char === "(") {
      parens++;
      output += char;
    } else if (char === ")") {
      parens--;
      output += char;
    } else if (parens === 0 && char === "{") {
      output = output.trimEnd() + " {\n";
      depth++;
      output += "  ".repeat(depth);
    } else if (parens === 0 && char === ";") {
      output = output.trimEnd() + ";\n" + "  ".repeat(depth);
    } else if (parens === 0 && char === "}") {
      output = output.trimEnd();
      if (output.endsWith(";")) output += "\n";
      depth = Math.max(0, depth - 1);
      if (!output.endsWith("\n")) output += "\n";
      output += "  ".repeat(depth) + "}\n";
      if (depth > 0) output += "  ".repeat(depth);
    } else {
      output += char;
    }
  }

  return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Los encabezados identifican la fuente, las responsabilidades y el punto de edición.
const stylesHtml = [
  "<!--",
  "  CSS compilado desde frontend/src/styles.css por pnpm build.",
  "  La hoja está organizada por tema: variables globales, navegación, elementos de interfaz,",
  "  formulario, resultados, estados y reglas responsive.",
  "  Edita la fuente CSS y vuelve a compilar; este archivo se genera automáticamente.",
  "-->",
  "<style>", formatCss(styles), "</style>"
].join("\n");
const clientHtml = [
  "<!--",
  "  JavaScript compilado desde frontend/src/main.js y model-input.js por pnpm build.",
  "  El cliente renderiza pantallas, valida/captura el formulario y llama al servidor con google.script.run.",
  "  Funciones de presentación: nav y wrap (marco común); table y home (resumen); form y field (intake);",
  "  review (confirmación); history (consulta); result (resultado y CRM); loading (estado de espera).",
  "  Funciones de flujo: render (pinta la vista); capture y valid (datos del formulario);",
  "  gasRequest (puente a google.script.run); historyRow y loadHistory (histórico); evaluate (envía una evaluación).",
  "  La predicción no ocurre aquí: está en apps-script/Model.gs, función predictRisk_.",
  "  Edita frontend/src y vuelve a compilar; este archivo se genera automáticamente.",
  "-->",
  "<script>", client, "</script>"
].join("\n");

// Bloquear el cierre de etiqueta inyectado desde JS antes de insertarlo en <script>.
if (/<\/script/i.test(client)) {
  throw new Error("Client.js contiene un cierre de script que no se puede embeber de forma segura.");
}

await writeFile(path.join(appScriptDir, "Styles.html"), stylesHtml, "utf8");
await writeFile(path.join(appScriptDir, "Client.html"), clientHtml, "utf8");
console.log("Vite compilado y embebido en Styles.html y Client.html de Apps Script.");
