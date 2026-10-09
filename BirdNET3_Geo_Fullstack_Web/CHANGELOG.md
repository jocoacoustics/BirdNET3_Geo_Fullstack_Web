# Cambios

## v0.2.1 — Modelos oficiales y persistencia web

- Elimina URLs rotas `models/acoustic_fp16.onnx` y las sustituye por direcciones oficiales de BirdNET y Geo en YAML.
- GitHub Actions publica solo código estático, sin alojar ONNX ni ejecutar scripts de descarga.
- Conservar modelos en IndexedDB, incluyendo archivos seleccionados manualmente; persistencia del valor del casillero.
- Botones **Comprobar caché** y **Proteger caché**; se mantiene **Limpiar caché**.
- Comprobación mínima de tamaño antes de almacenar, diagnóstico de CORS/HTTP y comprobación de número de clases frente a etiquetas.
- Preserva UX, espectrograma, parámetros 5 s / 1 s, reproducción por fila, exportaciones.
- Manual y pruebas actualizados.

**No se afirma aún una inferencia real completa en GitHub Pages** con los pesos oficiales; debe verificarse externamente.
