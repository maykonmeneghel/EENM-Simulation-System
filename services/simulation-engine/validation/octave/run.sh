#!/usr/bin/env bash
# Compares the Python engine (ORIGINAL) with "Mathematical Model/Main.m" run in GNU Octave.
# Needs Docker. Usage (from services/simulation-engine):
#   validation/octave/run.sh [duration_ms, default 1000] [--negative-controls]
#
# With --negative-controls, the same Octave run is then compared with Python runs that were deliberately
# perturbed (Python side only). Each control must FAIL the comparison: that is the evidence that the
# comparison can detect a difference of that size. The script exits 1 if the baseline fails or if any
# control passes. Outputs: validation/results/octave/comparison-<ms>ms.txt and
# negative-control-<name>-<ms>ms.txt.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
engine="$(cd "$here/../.." && pwd)"
model="$(cd "$engine/../.." && pwd)/Mathematical Model"
tmax=1000; controls=0
for arg in "$@"; do
  case "$arg" in
    --negative-controls) controls=1 ;;
    *) tmax="$arg" ;;
  esac
done
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
results="validation/results/octave"
cp "$here"/medfilt2.m "$here"/findpeaks.m "$here"/run_compare.m "$work"/
"$here/make_harness.sh" "$model/Main.m" "$work/main_harness.m"
docker build -q -t eenm-octave "$here" >/dev/null
cd "$engine"
uv run python -m validation.octave.export "$tmax" "$work/python.mat"
docker run --rm -v "$model":/model:ro -v "$work":/w -w /w \
  -e TMAX="$tmax" -e PYMAT=/w/python.mat -e OUTMAT=/w/octave.mat \
  eenm-octave octave-cli --no-gui run_compare.m 2> >(grep -v 'UTF-8\|called from\|^    ' >&2)
uv run python -m validation.octave.compare "$work/python.mat" "$work/octave.mat" \
  | tee "$results/comparison-${tmax}ms.txt"

[[ "$controls" == 1 ]] || exit 0

# name | temperature (°C; the model's reference is 6.3) | seed (draws the MUAP shapes, i.e. the force path only)
controls_table=(
  "temperature-6.8C|6.8|0"
  "temperature-8.0C|8.0|0"
  "seed-1|6.3|1"
)
undetected=()
for row in "${controls_table[@]}"; do
  IFS='|' read -r name temperature seed <<<"$row"
  out="$results/negative-control-${name}-${tmax}ms.txt"
  uv run python -m validation.octave.export "$tmax" "$work/control.mat" "$temperature" "$seed"
  {
    echo "negative control: Python run with temperature ${temperature} C, seed ${seed}; Octave run unchanged"
    echo "expected: FAIL (the comparison must detect this perturbation)"
    if uv run python -m validation.octave.compare "$work/control.mat" "$work/octave.mat"; then
      echo "CONTROL NOT DETECTED"
    else
      echo "CONTROL DETECTED"
    fi
  } | tee "$out"
  grep -q '^CONTROL DETECTED$' "$out" || undetected+=("$name")
done
if ((${#undetected[@]})); then
  echo "negative controls NOT detected: ${undetected[*]}" >&2
  exit 1
fi
echo "all ${#controls_table[@]} negative controls detected"
