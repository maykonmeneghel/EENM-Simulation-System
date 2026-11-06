"""English versions of the catalog texts the engine serves (conditions and muscle presets).

The pt-BR texts stay where they are defined (``conditions.py``, ``muscle_profiles.py``, ``interfaces/http/schemas.py``)
and are the keys here, so the Portuguese the app has always shown is unchanged; ``tests/unit/test_catalog_language.py``
fails if any served text has no English version.
"""

from __future__ import annotations

from typing import Literal

Lang = Literal["pt-BR", "en"]
"""Language of the catalog texts (``?lang=`` on ``GET /v1/conditions`` and ``GET /v1/muscles``)."""

EN: dict[str, str] = {
    # condition labels (interfaces/http/schemas.py)
    "Normal": "Normal",
    "Doença de Parkinson": "Parkinson's disease",
    "Lesão medular crônica": "Chronic spinal cord injury",
    # SCI_FATIGABILITY
    "Fadigabilidade lenta → rápida": "Fatigability slow → fast",
    "Fadigabilidade de cada unidade deslocada 99,7 % em direção à da unidade mais rápida (força das fibras "
    "mantida); ajustada para reproduzir o índice de fadiga 0,19.": "Fatigability of each unit shifted 99.7 % toward "
    "that of the fastest unit (fiber force kept); fitted to reproduce the fatigue index 0.19.",
    "Índice de fadiga do sóleo 0,19 ± 0,06 na lesão crônica contra 0,89 ± 0,08 na aguda (20 Hz, 330 ms a "
    "cada 1 s, 120 trens).": "Soleus fatigue index 0.19 ± 0.06 in chronic injury versus 0.89 ± 0.08 in acute injury "
    "(20 Hz, 330 ms every 1 s, 120 trains).",
    "sóleo; lesão completa (ASIA A) há ≥ 3 anos, n = 11": "soleus; complete injury (ASIA A) for ≥ 3 years, n = 11",
    # SCI_FAST_TWITCH
    "Abalo mais rápido": "Faster twitch",
    "Tempo de contração × 0,86 e meia-relaxação × 0,62.": "Contraction time × 0.86 and half-relaxation × 0.62.",
    "Quadríceps paralisado contraiu 14 % e relaxou 38 % mais rápido que o de controles.": "Paralysed quadriceps "
    "contracted 14 % and relaxed 38 % faster than that of controls.",
    "quadríceps (outro músculo); lesão motora completa, 11–24 anos, n = 13": "quadriceps (another muscle); "
    "motor-complete injury, 11–24 years, n = 13",
    # SCI_ATROPHY
    "Atrofia": "Atrophy",
    "Força do músculo × 0,56 (1,36 / 2,44 kg).": "Muscle force × 0.56 (1.36 / 2.44 kg).",
    "Massa muscular da coxa 1,36 ± 0,77 kg contra 2,44 ± 0,47 kg em controles (RM).": "Thigh muscle mass "
    "1.36 ± 0.77 kg versus 2.44 ± 0.47 kg in controls (MRI).",
    "coxa (outro músculo); lesão completa há > 2 anos, n = 8": "thigh (another muscle); complete injury for > 2 years, "
    "n = 8",
    # SCI_CHRONAXIE
    "Constante intensidade–duração menor": "Shorter strength–duration time constant",
    "τ de Weiss 0,459 → 0,13 ms (reobases mantidas). Cuidado: sozinho, isso BAIXA o limiar dos pulsos "
    "curtos, enquanto o artigo relata limiares mais altos (sem valor no resumo).": "Weiss τ 0.459 → 0.13 ms "
    "(rheobases kept). Caution: on its own, this LOWERS the threshold of short pulses, whereas the paper reports "
    "higher thresholds (no value in the abstract).",
    "τSD 0,13 ± 0,02 ms na lesão contra 0,43 ± 0,02 ms em controles (média ± EP).": "τSD 0.13 ± 0.02 ms in injury "
    "versus 0.43 ± 0.02 ms in controls (mean ± SE).",
    "nervos mediano e fibular comum (o resumo não diz de qual vem o τ); n = 15": "median and common peroneal nerves "
    "(the abstract does not say which one the τ comes from); n = 15",
    # PD_MOTOR_UNIT_LOSS
    "Perda leve de unidades motoras": "Mild motor unit loss",
    "Força do músculo × 0,845 (109 / 129); a reinervação que pode compensar não é modelada.": "Muscle force × 0.845 "
    "(109 / 129); the reinnervation that may compensate is not modeled.",
    "MUNIX hipotenar 109 ± 39,1 contra 129 ± 45,1 em controles.": "Hypothenar MUNIX 109 ± 39.1 versus 129 ± 45.1 in "
    "controls.",
    "hipotenar (mão, outro músculo); grupo inclui parkinsonismo atípico, n = 74": "hypothenar (hand, another muscle); "
    "the group includes atypical parkinsonism, n = 74",
    # PD_NEUROPATHY
    "Polineuropatia": "Polyneuropathy",
    "Força do músculo × 0,49 (CMAP 5,35 / 10,90 mV), lida como perda de axônios motores excitáveis.": "Muscle force "
    "× 0.49 (CMAP 5.35 / 10.90 mV), read as a loss of excitable motor axons.",
    "CMAP tibial 5,35 ± 3,79 mV com polineuropatia contra 10,90 ± 3,35 mV sem (pacientes com Parkinson).": "Tibial "
    "CMAP 5.35 ± 3.79 mV with polyneuropathy versus 10.90 ± 3.35 mV without (patients with Parkinson's disease).",
    "nervo tibial (perna); só quem tem polineuropatia (66 % da coorte), n = 41": "tibial nerve (leg); only those with "
    "polyneuropathy (66 % of the cohort), n = 41",
    # PD_TREMOR
    "Tremor de repouso 4–6 Hz": "Rest tremor 4–6 Hz",
    "Liga o drive descendente com uma oscilação senoidal comum a todos os motoneurônios (frequência e "
    "amplitude no painel do drive central). Precisa dos motoneurônios: no modo não invasivo, os disparos "
    "centrais encontram os do FES no axônio.": "Turns on the descending drive with a sinusoidal oscillation common to "
    "all motoneurons (frequency and amplitude in the central drive panel). Needs the motoneurons: in the "
    "non-invasive mode, the central spikes meet the FES spikes on the axon.",
    "Frequência típica do tremor de repouso 4–6 Hz (revisão); no punho, 4,4 ± 1,0 Hz (Dideriksen 2017) "
    "ou 5,9 ± 0,8 Hz em repouso (Agapaki 2018).": "Typical rest tremor frequency 4–6 Hz (review); at the wrist, "
    "4.4 ± 1.0 Hz (Dideriksen 2017) or 5.9 ± 0.8 Hz at rest (Agapaki 2018).",
    "revisão; a amplitude em nA vem de um modelo de tremor essencial (Gallego 2015)": "review; the amplitude in nA "
    "comes from an essential tremor model (Gallego 2015)",
    # muscle preset labels (motor_unit_pool.py): Latin names, the same in both languages except one
    "Soleus": "Soleus",
    "Gastrocnemius Medial": "Gastrocnemius Medial",
    "Gastrocnemius Lateral": "Gastrocnemius Lateral",
    "Tibial Anterior": "Tibialis Anterior",
    "Flexor Carpi Radialis (FCR)": "Flexor Carpi Radialis (FCR)",
    "Extensor Carpi Radialis (ECR)": "Extensor Carpi Radialis (ECR)",
    # muscle profiles (muscle_profiles.py)
    "Número de unidades motoras": "Number of motor units",
    "900, o total do sóleo: não há estimativa do número de unidades (MUNE) deste músculo em humanos.": "900, the "
    "soleus total: there is no estimate of the number of units (MUNE) of this muscle in humans.",
    "Motoneurônio, MUAP, condução e amplitude dos abalos": "Motoneuron, MUAP, conduction and twitch amplitude",
    "Faixas por tipo (S, FR, FF) da tabela do modelo original, as mesmas do sóleo.": "Ranges per type (S, FR, FF) from "
    "the original model's table, the same as the soleus.",
    "Fadigabilidade": "Fatigability",
    "Mapeamento de Potvin & Fuglevand 2017 sobre as forças do pool; não há índice de fadiga deste músculo "
    "medido em pessoas saudáveis.": "Potvin & Fuglevand 2017 mapping over the pool forces; there is no fatigue index "
    "of this muscle measured in healthy people.",
    "Composição S / FR / FF": "S / FR / FF composition",
    "368 / 267 / 265 unidades: fibras lentas 40,9 ± 17,4 %, IIA 29,7 % e “fast-b” 29,4 % (n = 7), "
    "com a fração de fibras usada como fração de unidades (suposição: unidades rápidas têm mais fibras).": "368 / 267 "
    "/ 265 units: slow fibers 40.9 ± 17.4 %, IIA 29.7 % and “fast-b” 29.4 % (n = 7), with the fiber fraction used as "
    "the unit fraction (assumption: fast units have more fibers).",
    "Tempo do abalo": "Twitch time course",
    "Abalo do músculo inteiro ajustado a contração 67,3 ms e meia-relaxação 57,6 ms (punho neutro, "
    "estímulo único no nervo mediano, n = 18; flexores do punho em conjunto, não só o FCR).": "Whole-muscle twitch "
    "fitted to contraction 67.3 ms and half-relaxation 57.6 ms (neutral wrist, single stimulus to the median nerve, "
    "n = 18; wrist flexors together, not only the FCR).",
    "Não há abalo de unidade isolada do FCR em humanos: ajuste do sóleo às unidades de Macefield 1996.": "There is no "
    "single-unit twitch of the FCR in humans: the soleus fit to the Macefield 1996 units.",
    "800 / 50 / 50, a do sóleo: não há composição de fibras do ECR adulto verificada.": "800 / 50 / 50, that of the "
    "soleus: there is no verified fiber composition of the adult ECR.",
    "Tempo de contração das unidades": "Contraction time of the units",
    "Escala de tempo calculada para a média das unidades simuladas ser 51,0 ms (25 unidades, 19,5–89,3 ms, "
    "7 homens; unidades registradas em força baixa, o que favorece as lentas).": "Time scale computed so the mean of "
    "the simulated units is 51.0 ms (25 units, 19.5–89.3 ms, 7 men; units recorded at low force, which favors the "
    "slow ones).",
    "Meia-relaxação das unidades": "Half-relaxation of the units",
    "Razão meia-relaxação / contração do ajuste do sóleo às unidades de Macefield 1996 (não há dado do ECR).": "Ratio "
    "half-relaxation / contraction of the soleus fit to the Macefield 1996 units (no ECR data).",
    "Não há abalo do músculo inteiro do ECR verificado: ajuste do sóleo ao tríceps sural.": "There is no verified "
    "whole-muscle twitch of the ECR: the soleus fit to the triceps surae.",
}


def localized(text: str, lang: Lang) -> str:
    """``text`` (pt-BR) in ``lang``; a text with no English version is a bug caught by the catalog tests."""
    if lang == "pt-BR":
        return text
    return EN[text]
