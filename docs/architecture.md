# Arquitectura funcional

```mermaid
flowchart TD
  subgraph Preparacion[Preparación del modelo fuera del runtime]
    H[Histórico de proyectos cerrados] --> T[Entrenamiento Python · modelo de 13 campos]
    T --> X[scripts/export_apps_script_model.py]
    X --> MD[apps-script/ModelData.gs · coeficientes, escalas y categorías]
  end

  subgraph Usuario[Experiencia de captura]
    PERSONA[Analista / equipo de Onboarding] --> UI[HTML Service: formulario y vistas]
    UI -->|google.script.run| DOGET[Code.gs · funciones servidor expuestas]
  end

  subgraph GAS[Runtime: Google Apps Script V8]
    DOGET --> VALIDAR[Validar campos requeridos y metadatos]
    VALIDAR --> MODEL[Model.gs · tipado, reglas y codificación one-hot]
    MD --> MODEL
    MODEL --> CLASIF[Regresión logística multinomial · softmax]
    CLASIF --> RUTA[Code.gs · política de atención por nivel]
    RUTA --> STORE[Repository.gs · escribir resultado provisional]
    STORE --> SHEET[(Google Sheets · Evaluaciones)]
    RUTA --> FINAL[Completar respuesta / estado]
    MODEL --> FINAL
    FINAL -->|respuesta asíncrona de google.script.run| UI
  end

  RUTA -. si hay URL y token .-> AGENT[Integrations.gs → webhook n8n de agente]
  AGENT -. texto de interpretación .-> FINAL
  RUTA -. si hay URL y token .-> CRM[Integrations.gs → webhook n8n de CRM]
  CRM -. estado y recordId .-> FINAL
  RUTA -. sin agente o con error .-> FALLBACK[Interpretación de respaldo; resultado no se pierde]
  FALLBACK --> FINAL

  subgraph Local[Desarrollo local]
    VITE[frontend/src · Vite] --> BUILD[pnpm build]
    BUILD --> BUNDLE[HTML embebido en Client.html y Styles.html]
    BUNDLE -. se usa al desplegar en Apps Script .-> UI
    VITE -. sin google.script.run .-> DEMO[Modo demostración; no predice ni guarda]
  end
```

## Ciclo de una evaluación

1. La persona completa los datos básicos del cliente/proyecto y 13 campos predictivos. Las opciones visibles están traducidas; los valores enviados al modelo permanecen en inglés.
2. `Client.html` recibe el evento de confirmar y llama al servidor Apps Script con `google.script.run.submitEvaluation(...)`.
3. `Code.gs` valida la estructura y `Model.gs` valida rangos, tipos y categorías conocidas. El servidor no confía en la validación de navegador.
4. `predictRisk_` estandariza numéricos, calcula los términos polinómicos guardados en el export, codifica categorías y calcula los logits de cada clase. Softmax convierte esos logits en probabilidades; la clase con logit mayor es el nivel predicho.
5. `routeForRisk_` traduce el nivel a una ruta inicial. Esa tabla es política de prototipo y debe revisarse con el negocio.
6. `Repository.gs` escribe una fila trazable con el `evaluationId`, el resultado y el input. Luego las integraciones opcionales llaman a n8n; el agente recibe empresa/proyecto, clase, probabilidades, versión y ruta, no los 13 campos del formulario.
7. Si n8n no está configurado o falla, la evaluación se conserva y se indica `FALLBACK`, `NOT_CONFIGURED` o `PENDING`; esos estados no significan que HubSpot haya creado un ticket.
8. La respuesta completa regresa a la vista de resultado; el listado de histórico lee los objetos serializados de la hoja `Evaluaciones`.

## Fronteras entre componentes

- **Frontend local:** sirve para iterar la interfaz. Cuando `google.script.run` no existe, produce una tarjeta claramente marcada como demo y no invoca modelo, Sheets, agente ni CRM.
- **Apps Script:** sirve la UI y aloja la inferencia real. No se despliega una API Node para obtener el riesgo.
- **Modelo:** solo recibe las variables acordadas del formulario. `ModelData.gs` es un artefacto generado y debe corresponder al export Python y la versión anotada.
- **n8n:** integración opcional para agente/CRM; contiene las credenciales externas. El token de HubSpot no debe aparecer en front-end, parámetros ni Git.
- **Google Sheets:** histórico operativo mínimo para el prototipo. Su ID solo se configura en Script Properties.

## Limitaciones visibles

La evaluación no alcanza la meta de macro-F1 > 0,80 del reto. Macro-F1/accuracy reportadas en el experimento de 13 campos estuvieron aproximadamente en 0,54. Las probabilidades no están calibradas. Mostrar más decimales no hace más confiable la predicción. Antes de utilizarlo como política real se requiere validación temporal/externa, revisión de errores por clase, calibración, monitoreo de datos y aprobación de las reglas por Onboarding.
