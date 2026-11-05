#!/usr/bin/env bash
# Writes main_harness.m: "Mathematical Model/Main.m" with only the changes Octave needs.
#   - clc/clear/close all removed (clear would wipe the inputs set by run_compare.m)
#   - tmax = TMAX instead of 1000
#   - batch/wait/fetchOutputs (Parallel Computing Toolbox, absent in Octave) -> direct runnn calls
#   - p = randi([0,1]) -> p = SHAPE_<type>(k): the MUAP shapes drawn by the Python engine
set -euo pipefail
main="$1"; out="$2"
awk '
/^clc;|^clear;|^close all;/ {next}
/currentEENM\(1000,/ {sub(/currentEENM\(1000,/,"currentEENM(TMAX,")}
/^job\(1\)/ {print "Data_S = cell(1,3); [Data_S{:}] = runnn(Parameters.data.Motoneurons.S.Quantity ,Parameters.data.Motoneurons.S.Area ,Parameters, 1,Parameters.time,y0);"; next}
/^job\(2\)/ {print "Data_FR = cell(1,3); [Data_FR{:}] = runnn(Parameters.data.Motoneurons.FR.Quantity ,Parameters.data.Motoneurons.FR.Area ,Parameters, 1,Parameters.time,y0);"; next}
/^job\(3\)/ {print "Data_FF = cell(1,3); [Data_FF{:}] = runnn(Parameters.data.Motoneurons.FF.Quantity ,Parameters.data.Motoneurons.FF.Area ,Parameters, 1,Parameters.time,y0);"; next}
/^wait\(job/ {next}
/fetchOutputs/ {next}
/p=randi\(\[0,1\]\);/ {n++; t=(n==1?"S":(n==2?"FR":"FF")); sub(/p=randi\(\[0,1\]\);/,"p=SHAPE_" t "(k);")}
{print}
' "$main" > "$out"
# every replacement must have happened, or the harness is not the model it claims to be
grep -q 'currentEENM(TMAX,' "$out"
[ "$(grep -c '= runnn(' "$out")" -eq 3 ]
[ "$(grep -c 'p=SHAPE_' "$out")" -eq 3 ]
! grep -q 'batch(\|randi(\|fetchOutputs' "$out"
