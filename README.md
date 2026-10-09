# BirdNET3_Geo_Fullstack_Web · v0.2.1

Aplicación web estática (GitHub Pages), sin Colab ni servidor de inferencia. WAV/MP3 y predicciones se procesan **en el navegador** mediante ONNX Runtime Web. Conserva la UX de BirdNET v0.2.0 y corrige el error `HTTP 404 /models/acoustic_fp16.onnx`.

## Inicio y publicación

1. Copia el contenido del proyecto al repositorio `BirdNET3_Geo_Fullstack_Web` (incluida `.github/workflows/pages.yml`).
2. Haz commit + push con GitHub Desktop.
3. En GitHub: **Settings → Pages → Source: GitHub Actions** (la acción ya no descarga modelos; solo publica archivos livianos).
4. Abre `https://jocoacoustics.github.io/BirdNET3_Geo_Fullstack_Web/`. Haz recarga forzada `Ctrl+Shift+R` tras desplegar para evitar JS anterior.
5. Sube un audio en la UX. El análisis empieza automáticamente y muestra el progreso en la tarjeta del audio.

### Origen de los modelos

**Los modelos no vienen en el ZIP, no se suben al repositorio ni se sirven desde `models/`.** El navegador intenta obtenerlos directamente de:

- Acústico BirdNET+ Preview 3.1 FP16 pruned y etiquetas 11K: [Zenodo oficial, registro 20703646](https://zenodo.org/records/20703646).
- Geo y etiquetas 14K: [BirdNET Geomodel, demostración web oficial](https://birdnet-team.github.io/geomodel/demo/).

Las direcciones exactas están en **`config.yaml`**. Geo se descarga solamente si el audio tiene coordenadas y semana válidas y se habilita la opción Geo. La taxonomía extendida **no se necesita** para esta inferencia: las etiquetas específicas de cada modelo ya permiten mostrar nombres científicos y alinear scores.

**Limitación importante:** no podemos garantizar desde este entorno que Zenodo habilite CORS para todas las visitas a GitHub Pages. Si el navegador bloquea `fetch` con CORS, abre Zenodo desde el enlace **BirdNET acústico oficial**, descarga el modelo `.onnx` FP16 pruned y su CSV, selecciona ambos en **Modelos ONNX → Archivos locales alternativos** y pulsa **Analizar**. Haz lo mismo con Geo solo si hace falta. Con **Conservar modelos** activado, la importación local también queda en IndexedDB y no hay que repetirla mientras el navegador mantenga esos datos.

### Caché local y limpieza

- `Conservar modelos en este navegador` viene marcado por defecto. Su preferencia se guarda entre visitas (`localStorage`).
- Modelos y etiquetas se guardan en **IndexedDB** con clave por recurso y URL oficial, no por el nombre del WAV.
- `Comprobar caché`: estado de acústico, etiquetas, Geo y etiquetas Geo.
- `Proteger caché`: solicita a Chromium persistencia de almacenamiento (`navigator.storage.persist()`). El navegador puede denegarla; no promete conservación absoluta.
- `Limpiar caché`: borra solamente los recursos IndexedDB de BirdNET. El audio no se guarda allí.
- Si cambian las versiones oficiales, **Limpiar caché** permite obtener el modelo actualizado.
- La primera carga necesita conexión para ONNX Runtime Web (CDN) y, si no hay caché, modelos oficiales.

## Experiencia y parámetros

- Audio analizado al subir; botón **Analizar** para recalcular cuando modificas configuración.
- Ventanas 5 s, solapamiento 1 s, Top K 100, umbral de inferencia 0.01, umbral de visualización 0.10 (YAML).
- `P-BLACKT_20260419_060002_30.wav` → fecha 2026-04-19, 06:00:02, UTC−05:00. Ignora `_30`. Coordenadas opcionales y campos editables.
- Acústico + Geo en columnas independientes; Geo no filtra especies raras.
- Espectrograma recalculado al hacer zoom, selección mediante recuadro, clic para cursor, modo Mel/lineal, botón Ver todo y tabla independiente ordenable.
- Reproducción por fila desde su inicio hasta el fin, con pausa por fila.
- CSV + etiquetas de Audacity (`Nombre científico 0.86`), sin corchetes.
- GPU mediante WebGPU si el modelo y navegador permiten sus operadores; fallback a WASM/CPU.
- `Descargar log` guarda los errores y eventos visibles, útil en páginas sin backend.

## Archivos y desarrollo

- `index.html`, `style.css`, `src/app.js`: UX.
- `src/onnx.worker.js`: descarga oficial, validación mínima de tamaño, IndexedDB y ONNX.
- `config.yaml`: fuentes y parámetros, sin URLs locales inexistentes.
- `.github/workflows/pages.yml`: publica **solo el sitio estático**.
- `documentacion.html`: manual navegable.
- `tests/test_browser_v021.py`: prueba UX con motor simulado, sin pesos ONNX.
- `tests/test_worker.mjs`, `tests/test_cache_worker.mjs`: pruebas de worker e IndexedDB simulado.

**Verificación pendiente:** inferencia completa con los pesos oficiales descargados desde una página GitHub Pages real (CORS, compatibilidad WebGPU/WASM y correspondencia acústico/Geo). Los tests simulados comprueban lógica e interacciones, pero no validan científicamente las detecciones.

## Licencias

Lee `CREDITOS_Y_LICENCIAS.md`. El código propio se distribuye bajo MIT. Los modelos, aunque descargados de fuentes oficiales, siguen sujetos a sus licencias y condiciones específicas.
