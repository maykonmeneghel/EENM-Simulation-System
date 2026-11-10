"""Engine lock: with ``EENM_ENGINE_SECRET`` set, only callers sending ``X-Engine-Key: <secret>`` reach the engine.

The public API sends the header; ``/health`` stays open for the Lambda Web Adapter's readiness check. A plain ASGI
middleware (not Starlette's ``BaseHTTPMiddleware``) so the NDJSON stream passes through untouched.
"""

from __future__ import annotations

import hmac
import json

from starlette.types import ASGIApp, Receive, Scope, Send

ENGINE_SECRET = "EENM_ENGINE_SECRET"
HEADER = b"x-engine-key"
OPEN_PATHS = frozenset({"/health"})


class EngineKeyMiddleware:
    def __init__(self, app: ASGIApp, secret: str) -> None:
        if not secret:
            raise ValueError("the engine secret must not be empty")
        self._app = app
        self._secret = secret.encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") in OPEN_PATHS or self._authorised(scope):
            await self._app(scope, receive, send)
            return
        body = json.dumps({"detail": "missing or wrong X-Engine-Key"}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})

    def _authorised(self, scope: Scope) -> bool:
        supplied = b""
        for name, value in scope.get("headers", []):
            if name == HEADER:
                supplied = value
                break
        # constant time: the comparison does not stop at the first differing byte
        return hmac.compare_digest(supplied, self._secret)
