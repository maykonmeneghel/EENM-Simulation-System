#!/usr/bin/env bash
# Compares the Python engine (ORIGINAL) with "Mathematical Model/Main.m" run in GNU Octave.
# Needs Docker. Usage (from services/simulation-engine): validation/octave/run.sh [duration_ms, default 1000]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
engine="$(cd "$here/../.." && pwd)"
model="$(cd "$engine/../.." && pwd)/Mathematical Model"
tmax="${1:-1000}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp "$here"/medfilt2.m "$here"/findpeaks.m "$here"/run_compare.m "$work"/
"$here/make_harness.sh" "$model/Main.m" "$work/main_harness.m"
docker build -q -t eenm-octave "$here" >/dev/null
cd "$engine"
uv run python -m validation.octave.export "$tmax" "$work/python.mat"
docker run --rm -v "$model":/model:ro -v "$work":/w -w /w \
  -e TMAX="$tmax" -e PYMAT=/w/python.mat -e OUTMAT=/w/octave.mat \
  eenm-octave octave-cli --no-gui run_compare.m 2> >(grep -v 'UTF-8\|called from\|^    ' >&2)
uv run python -m validation.octave.compare "$work/python.mat" "$work/octave.mat" \
  | tee "validation/results/octave/comparison-${tmax}ms.txt"
