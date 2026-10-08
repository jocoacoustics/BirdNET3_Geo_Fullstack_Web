#!/usr/bin/env bash
# Descarga en máquina del usuario o GitHub Actions. No subir modelos al repo.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
fetch() {
  local file="$1" url="$2" min="$3"
  if [[ -s "$file" ]] && [[ $(wc -c < "$file") -gt "$min" ]]; then
    echo "Reutilizando $(basename "$file")"; return
  fi
  echo "Descargando $(basename "$file")"
  curl --fail --location --retry 3 --retry-delay 4 --connect-timeout 30 --progress-bar "$url" --output "$file.part"
  local actual
  actual=$(wc -c < "$file.part")
  if [[ "$actual" -le "$min" ]]; then echo "Tamaño sospechoso ($actual bytes) para $file" >&2; rm -f "$file.part"; exit 1; fi
  mv "$file.part" "$file"
}
fetch models/acoustic_fp16.onnx 'https://zenodo.org/records/20703646/files/BirdNET+_V3.0-preview3.1_Global_11K_FP16_pruned.onnx?download=1' 20000000
fetch models/acoustic_labels.csv 'https://zenodo.org/records/20703646/files/BirdNET+_V3.0-preview3.1_Global_11K_Labels.csv?download=1' 300000
fetch models/geo_fp16.onnx 'https://birdnet-team.github.io/geomodel/demo/geomodel_fp16.onnx' 1000000
fetch models/geo_labels.txt 'https://birdnet-team.github.io/geomodel/demo/labels.txt' 100000
printf '\nListo. Modelos y etiquetas en ./models/\n'
