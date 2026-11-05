FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
EXPOSE 8001
CMD ["uv", "run", "--no-dev", "uvicorn", "eenm_engine.interfaces.http.app:app", "--host", "0.0.0.0", "--port", "8001"]
