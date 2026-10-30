# Google Apps Script

Esta carpeta contiene el código de servidor y los archivos que sirven la interfaz desde el proyecto de Apps Script.

## Responsabilidades por archivo

- `Code.gs`: publica la app (`doGet`), arma la solicitud (`submitEvaluation`), aplica la política de ruta y entrega el histórico.
- `Model.gs`: valida las 13 variables y calcula la clase/probabilidades del modelo en V8. Esta es la inferencia real; no requiere URL de API.
- `ModelData.gs`: parámetros generados de la regresión de 13 campos. No editarlo a mano.
- `Repository.gs`: escribe/actualiza y consulta el histórico de la pestaña `Evaluaciones`.
- `Integrations.gs`: llama al webhook del agente y al webhook CRM de n8n cuando están configurados.
- `ModelSmokeTest.gs`: comparación de inferencia en cuatro ejemplos de referencia; no hace escrituras ni llamadas HTTP.
- `Index.html`: estructura principal de HTML Service.
- `Client.html` y `Styles.html`: bundles legibles de Vite. Incluyen un encabezado con el mapa de funciones/estilos; son generados, no son fuente de edición.
- `appsscript.json`: manifiesto con runtime V8, zona horaria y scopes para Sheets y solicitudes HTTP.

## Configuración privada

Guardar mediante **Project Settings → Script Properties**. No escribir los valores en archivos ni en Git.

| Propiedad | Uso |
| --- | --- |
| `SPREADSHEET_ID` | Requerida: identifica el Sheet cuyo tab se llama `Evaluaciones`. |
| `N8N_AGENT_URL` / `N8N_AGENT_TOKEN` | Opcionales: webhook y autenticación del agente de interpretación. |
| `N8N_CRM_URL` / `N8N_CRM_TOKEN` | Opcionales: webhook para la acción CRM. Si no se define el token propio, usa el token común de n8n. La clave HubSpot sigue almacenada en n8n. |

## Mantener fuente local y Apps Script alineados

Usar Clasp con la cuenta Google autorizada. Antes de la primera sincronización, copiar `.clasp.json.example` como `.clasp.json` en esta carpeta y reemplazar el ID del proyecto; el archivo real está excluido de Git.

```powershell
pnpm exec clasp login   # una vez, autenticar la cuenta de Google en el navegador
pnpm run gas:pull       # leer los archivos guardados en Apps Script
pnpm build              # solo si se cambió frontend/src; genera Client.html y Styles.html
pnpm run gas:push       # actualizar los fuentes remotos
```

`.clasp.json` y `.clasprc.json` son locales/privados y se excluyen con `.gitignore`. Para probar inferencia desde el editor, ejecutar `testInstalledModel()`; para que la web app refleje un nuevo despliegue, publicar una versión desde el panel **Implementar**.
