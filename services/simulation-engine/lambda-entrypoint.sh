#!/bin/sh
# Entrypoint of Dockerfile.lambda: Numba needs a writable cache directory, Lambda only offers /tmp.
# Copy the cache built into the image there (once per container) and start uvicorn on it.
set -eu
runtime="${NUMBA_RUNTIME_CACHE_DIR:-/tmp/numba-cache}"
if [ ! -d "$runtime" ]; then
    mkdir -p "$runtime"
    cp -R "${NUMBA_CACHE_DIR:-/opt/numba-cache}/." "$runtime/"
fi
export NUMBA_CACHE_DIR="$runtime"
exec uvicorn eenm_engine.interfaces.http.app:app --host 0.0.0.0 --port "${AWS_LWA_PORT:-8001}" --no-access-log
