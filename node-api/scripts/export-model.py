"""Export only preprocessing parameters and logistic weights from the validated joblib."""
import json
import sys
from pathlib import Path

import joblib

api_root = Path(__file__).resolve().parents[1]
artifact = api_root / "model" / "modelo_candidato.joblib"
output = api_root / "model" / "risk-model.json"
bundle = joblib.load(artifact)
pipeline = bundle["model"]
pre = pipeline.named_steps["pre"]
numeric_transformer, numeric_columns = next((t, cols) for name,t,cols in pre.transformers_ if name == "num")
categorical_encoder, categorical_columns = next((t, cols) for name,t,cols in pre.transformers_ if name == "cat")
numeric_steps = dict(numeric_transformer.named_steps)
classifier = pipeline.named_steps["model"]
data = {
    "version": "risk-logistic-v1",
    "numeric": numeric_columns,
    "categorical": categorical_columns,
    "categories": {name: [str(value) for value in values] for name,values in zip(categorical_columns,categorical_encoder.categories_)},
    "numericMedian": [float(v) for v in numeric_steps["impute"].statistics_],
    "numericMean": [float(v) for v in numeric_steps["scale"].mean_],
    "numericScale": [float(v) for v in numeric_steps["scale"].scale_],
    "numericRescaleMean": [float(v) for v in numeric_steps["rescale"].mean_],
    "numericRescaleScale": [float(v) for v in numeric_steps["rescale"].scale_],
    "classes": [str(value) for value in classifier.classes_],
    "intercepts": [float(v) for v in classifier.intercept_],
    "coefficients": [[float(v) for v in row] for row in classifier.coef_],
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Exported {len(data['numeric']) + len(data['categorical'])} feature names to {output}")
