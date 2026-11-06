"""The catalog texts (``GET /v1/conditions``, ``GET /v1/muscles``) in both languages (``?lang=``)."""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.texts_en import EN
from eenm_engine.interfaces.http.app import create_app
from tests.fakes import SpikingSolver

client = TestClient(create_app(RunSimulation(SpikingSolver())))

PORTUGUESE = re.compile(r"[ãõçáéíóúâêô]", re.IGNORECASE)
SOURCE_FIELDS = {"citation", "title", "doi", "pmid"}
"""Bibliographic data: the same in both languages (titles in the paper's language)."""
TRANSLATED = {"label", "effect", "finding", "measuredIn", "field", "value"}
SAME_IN_BOTH = {
    "Normal",
    "Soleus",
    "Gastrocnemius Medial",
    "Gastrocnemius Lateral",
    "Flexor Carpi Radialis (FCR)",
    "Extensor Carpi Radialis (ECR)",
}
"""Texts that are the same in English (a condition name and Latin muscle names); any other text must change."""


def _texts(node: object, key: str = "") -> list[tuple[str, str]]:
    """(field, text) of every translatable string in a catalog response."""
    if isinstance(node, dict):
        return [t for k, v in node.items() if k not in SOURCE_FIELDS and k != "source" for t in _texts(v, k)]
    if isinstance(node, list):
        return [t for v in node for t in _texts(v, key)]
    if isinstance(node, str) and key in TRANSLATED:
        return [(key, node)]
    return []


def _skeleton(node: object, key: str = "") -> object:
    """The response with its translatable strings blanked."""
    if isinstance(node, dict):
        return {k: _skeleton(v, k) for k, v in node.items()}
    if isinstance(node, list):
        return [_skeleton(v, key) for v in node]
    return None if isinstance(node, str) and key in TRANSLATED else node


def _get(path: str, lang: str | None = None) -> list[dict[str, object]]:
    response = client.get(path, params={} if lang is None else {"lang": lang})
    assert response.status_code == 200, response.text
    body: list[dict[str, object]] = response.json()
    return body


def test_portuguese_is_the_default_and_unchanged() -> None:
    for path in ("/v1/conditions", "/v1/muscles"):
        assert _get(path) == _get(path, "pt-BR")
    conditions = {c["id"]: c for c in _get("/v1/conditions")}
    assert conditions["SCI_CHRONIC"]["label"] == "Lesão medular crônica"
    assert conditions["PARKINSON"]["adjustments"][0]["label"] == "Perda leve de unidades motoras"  # type: ignore[index]


def test_english_has_every_text_translated_and_the_same_structure() -> None:
    for path in ("/v1/conditions", "/v1/muscles"):
        pt, en = _get(path, "pt-BR"), _get(path, "en")
        pt_texts, en_texts = _texts(pt), _texts(en)
        assert [k for k, _ in pt_texts] == [k for k, _ in en_texts]  # same fields in the same order
        assert len(pt_texts) > 10
        for (_, p), (_, e) in zip(pt_texts, en_texts, strict=True):
            assert e == EN[p]
            assert not PORTUGUESE.search(e), e
            assert (e == p) == (p in SAME_IN_BOTH), p  # catches an untranslated text without diacritics
        assert _skeleton(pt) == _skeleton(en)  # ids, numbers and sources do not depend on the language
    conditions = {c["id"]: c for c in _get("/v1/conditions", "en")}
    assert conditions["SCI_CHRONIC"]["label"] == "Chronic spinal cord injury"
    muscles = {m["id"]: m for m in _get("/v1/muscles", "en")}
    assert muscles["TIBIALIS_ANTERIOR"]["label"] == "Tibialis Anterior"


def test_an_unknown_language_is_rejected() -> None:
    assert client.get("/v1/conditions", params={"lang": "fr"}).status_code == 422
    assert client.get("/v1/muscles", params={"lang": "pt"}).status_code == 422
