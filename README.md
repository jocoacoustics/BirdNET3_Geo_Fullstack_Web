# BirdNET3_Geo_Fullstack_Web v0.2.0

**Aplicación estática para GitHub Pages, sin Colab ni servidor Python.** El audio permanece en el navegador; ONNX Runtime Web carga los modelos oficiales y ejecuta acústico / Geo localmente.

## Instalación en GitHub Pages (recomendada)

1. Crea un repositorio nuevo llamado `BirdNET3_Geo_Fullstack_Web` (o el nombre que elijas).
2. Descomprime y sube **el contenido** de este ZIP a la raíz de la rama `main`, incluyendo `.github/workflows/pages.yml`.
3. En **Settings → Pages → Build and deployment**, elige **Source: GitHub Actions**.
4. Ejecuta la acción `Publicar BirdNET Web en GitHub Pages` si no se inició con el push. Esta descarga los modelos dentro del artefacto publicado, **no los añade al historial Git**.
5. Abre la URL que GitHub Pages muestre al terminar el despliegue. No abras `index.html` mediante `file://`, pues los workers y `fetch` exigen HTTP(S).

> El despliegue descarga un modelo acústico de ~68 MB y un Geo ~7.5 MB. Si los proveedores originales cambian de URL, edita `scripts/prepare_models.sh`. Un flujo roto aparecerá explícitamente como error en GitHub Actions, no como predicciones ficticias.

## Primera prueba local

```bash
./scripts/prepare_models.sh
python -m http.server 8000
```

Abre `http://localhost:8000`. Requiere internet para descargar el motor WebAssembly de ONNX Runtime Web. El navegador también podría leer modelos ONNX seleccionados manualmente en **Modelos ONNX → Archivos locales alternativos**.

## Uso

- Al subir WAV/MP3/OGG/M4A compatible, comienza automáticamente el análisis.
- Mientras se analiza, la **tarjeta de audio sustituye el nombre del archivo por la barra de progreso**; al terminar, recupera el nombre.
- Valores predeterminados: ventana 5 s; overlap 1 s; topK 100; umbral de inferencia 0.01; visualización 0.10.
- El botón **Analizar** sirve para recalcular tras modificar parámetros.
- Metadatos del nombre de archivo: `P-BLACKT_20260419_060002_30.wav` → 2026-04-19, 06:00:02, UTC−05:00, sin coordenadas; se ignora el sufijo `_30`. Los campos son editables.
- Geo requiere coordenadas y semana 1–48. Si no están disponibles, la columna queda vacía; no hay puntuaciones inventadas.
- Clic en espectrograma posiciona el cursor; arrastrar dibuja caja de zoom; **Ver todo** restaura la vista. Fila ▶ reproduce desde su inicio y termina al final; ▶ se vuelve ❚❚.
- Exporta TXT Audacity con nombre científico y score a **2 decimales sin corchetes**, o CSV con dos scores originales.

## Reutilización de modelos / GPU

Marca **Conservar modelos en este navegador** para guardarlos en IndexedDB. Los modelos pueden ser eliminados automáticamente por falta de espacio, navegación privada o limpieza del navegador. **Limpiar caché** elimina la copia persistente de la aplicación. La selección GPU/WASM procede de `config.yaml`: `auto` prueba WebGPU y si falla cambia a WASM. La preview acústica tiene operadores que pueden no estar soportados en WebGPU; CPU puede ser la única ruta viable en determinados equipos.

## Archivos

- `index.html`, `style.css`, `src/app.js`: frontend HTML/JS.
- `src/onnx.worker.js`: modelo acústico y geomodel en un Web Worker, progreso, IndexedDB, fallback GPU/CPU.
- `config.yaml`: rutas, parámetros y comportamiento por defecto; sin recompilación.
- `.github/workflows/pages.yml`: descarga modelos y publica web.
- `scripts/prepare_models.sh`: descarga opcional para pruebas locales.
- `documentacion.html`: manual de usuario.
- `CREDITOS_Y_LICENCIAS.md`: fuentes y atribución.
- `tests/`: pruebas de funciones y estructura.

## Estado de validación

La estructura y JavaScript se pueden probar offline. No se ha ejecutado aquí inferencia real con los ONNX grandes debido a que este entorno no tiene acceso HTTP a Zenodo/CDN. La primera verificación científica debe hacerse con un WAV de referencia y comparar resultados con nuestra v0.1.2 Colab, pues los modelos acústicos ONNX optimizados pueden tener pequeñas diferencias respecto a FP32.
