# Model equations (single source for the UI's "Equações" view)

What the engine actually computes, per `modelVariant`. Every equation names the code that implements it and
the request fields (`camelCase`) or constants it uses, so the UI can show it with the current values.
Units: time in ms, voltage in mV, current in the stimulus amplitude units (µA/cm² for the soma model).

Stages, in order: **1 Stimulus → 2 Excitation (motoneuron *or* motor axon) → 3 Conduction → 4 MUAP / EMG →
5 Twitch → 6 Rate saturation → 7 Fatigue → 8 Muscle force.** `ORIGINAL` uses 1, 2a, 3, 4, 5a, 8a;
`LITERATURE` uses 1, 2b, 3, 4, 5b, 6, 7, 8b (stage 3 has one formula per variant).

---

## 1. Stimulus — `domain/stimulus.py` (port of `FES.m`)

Pulse train (monophasic), with `f = frequencyHz/1000` (kHz, t in ms) and duty `D = dutyCyclePercent`:

$$ I(t) = A \cdot \frac{\operatorname{sq}(2\pi f t,\ D) + 1}{2}, \qquad \operatorname{sq}(x, D) = \begin{cases} +1 & x \bmod 2\pi < \tfrac{D}{100}2\pi \\ -1 & \text{otherwise} \end{cases} $$

Biphasic: `I(t) = A·sq(2πft, D)`. Pulse width `PW = D / (100·f)` ms (e.g. 20 % at 40 Hz → 5 ms; 1.2 % → 0.3 ms).
Amplitude modulation shapes multiply `A` by: STEP 1; RAMP `t/T`; TRIANGLE `t/t_p` up to `t_p = peakTimeMs` then
`1 − (t − t_p)/(T − t_p)`; SINUSOIDAL `sin t` (t in ms, Q10). `T = durationMs`. Frequency and pulse-width
modulations follow `FES.m` literally (see the code). Optional trains: `I(t) = 0` when
`t mod trainPeriodMs ≥ trainOnMs`.

Fields: `amplitude` (A), `frequencyHz`, `dutyCyclePercent`, `waveform`, `modulation.*`, `trainOnMs`, `trainPeriodMs`.

**Stimulator mode** (not in the original; used by the app, `pulseWidthUs` set): pulses defined in time, with the pulse
width independent of the frequency, and an amplitude envelope with ramps. With `T_p = 1000/f` ms and `τ = t mod T_p`:

$$ I(t) = A \cdot E(t) \cdot p(t), \qquad p(t) = \begin{cases} +1 & \tau < PW \\ -1 & PW \le \tau < 2\,PW \ \text{(BIPHASIC\_SYMMETRIC only)} \\ 0 & \text{otherwise} \end{cases} $$

$$ E(t) = \min\left(1,\ \frac{u}{t_\uparrow},\ \frac{T_{on} - u}{t_\downarrow}\right),\quad u = t \bmod T_{trem}\ \ (u = t\ \text{without trains});\qquad E = 0\ \text{if}\ u \ge T_{on} $$

`PW = pulseWidthUs/1000`, `t_↑ = rampUpMs`, `t_↓ = rampDownMs` (a zero ramp is skipped), `T_on = trainOnMs` (or
`durationMs`), `T_trem = trainPeriodMs`. Modulation must stay AMPLITUDE / STEP. The web preview
(`apps/web/src/domain/stimulator.ts`) is tested against the engine on `stimulator.fixture.json`.

**Explicit pulse sequence** (not in the original; `pulseTimesMs` set, needs `pulseWidthUs`): the onsets
`t_1 < t_2 < … < t_N` replace the periodic onsets `k·T_p`; `p(t)` is the same pulse with `τ` measured from the latest
onset reached, and `E(t)` is unchanged:

$$ u = t \bmod T_{trem}\ \ (u = t\ \text{without trains}), \qquad j = \max\{\,i : t_i \le u + 10^{-9}\,\}, \qquad \tau = u - t_j $$

Without trains the `t_i` are times of the run; with trains they are times from the start of every train and the
sequence repeats in each one. `frequencyHz` and `dutyCyclePercent` have no effect; `amplitude`, `pulseWidthUs`,
`waveform` (MONOPHASIC or BIPHASIC_SYMMETRIC), `trainOnMs` / `trainPeriodMs` and `rampUpMs` / `rampDownMs` apply as
above. Only whole pulses are delivered (`I = 0` for a pulse that would end after `durationMs`; the periodic train keeps
such a pulse, cut). Rules: `0 ≤ t_1`, strictly increasing; consecutive onsets at least `phases·PW + stepMs` apart (one
sample of zero current between pulses, otherwise the sampled pulses touch and stage 2b reads them as one longer pulse;
with trains this includes the last pulse of a train to the first of the next); `t_N + phases·PW ≤ trainOnMs` (with
trains) or `≤ durationMs`; `PW ≥ stepMs`; at most `max_pulses` (default 100 000) pulses over the whole run. A periodic
train written as its onsets `k·T_p` gives a bit-identical stimulus, spike trains and force
(`tests/unit/test_pulse_sequences.py`).

## 2a. Motoneuron (ORIGINAL) — `domain/motoneuron.py` (port of `rates.m`)

Two compartments per unit, soma `V_s` and dendrite `V_d`, coupled through `g_c` and the soma-area fraction
`p = A_s/(A_s + A_d)` (from the unit's geometry):

$$ C_s \frac{dV_s}{dt} = I_{s} - g_{Na}\, m_\infty^3(V_s)\, h\,(V_s - E_{Na}) - g_{Ca}\, m_{Ca}^2 h_{Ca}(V_s - E_{Ca}) - g_K\, n^4 (V_s - E_K) - g_{KCa}\frac{[Ca]_s}{K_d + [Ca]_s}(V_s - E_K) - g_L (V_s - E_L) + \frac{g_c}{p}(V_d - V_s) $$

$$ C_d \frac{dV_d}{dt} = I_{d} - g_{Ca,d}\, m_{Ca,d}(V_d - E_{Ca}) - g_{NaP}\, m_{NaP} h_{NaP}(V_d - E_{Na}) - g_{KCa,d}\frac{[Ca]_d}{K_d + [Ca]_d}(V_d - E_K) - g_L (V_d - E_L) + \frac{g_c}{1-p}(V_s - V_d) $$

Gates relax as `dx/dt = φ (x_∞(V) − x)/τ_x(V)`, `φ = 3^{(T_°C − 6.3)/10}`; calcium
`d[Ca]/dt = φ(−f α I_Ca − f k_Ca [Ca])`. `injectionSite = SOMA`: `I_s = I(t)`, `I_d = 0`; `DENDRITE`: `I_d = I(t)`, `I_s = 0`.
Constants (`Conductances`): `E_Na = 55, E_K = −80, E_L = −60, E_Ca = 80 mV` (as `v + v_rest`), `g_Na = 80,
g_K = 100, g_Ca = 14, g_KCa = 6, g_L = 0.51, g_c = 0.1, g_NaP = 0.1, g_Ca,d = 0.25`, `C = 1`.

Fields: `injectionSite`, `temperatureCelsius`, `somaGeometry`, `dendriteGeometry`, `muscle`, `unitsPerType`.

## 2b. Motor axon (LITERATURE) — `domain/axon_stimulation.py`

Each axon `k` has a rheobase `I_rh,k`; a pulse of width `PW` and amplitude `A` fires it when (Weiss):

$$ A \;\ge\; I_{rh,k}\left(1 + \frac{\tau_{SD}}{PW}\right), \qquad \tau_{SD} = 0.459\ \text{ms} \;\text{(Mogyoros et al. 1996)} $$

`I_rh,k` spread linearly over `[I_rh,min, R·I_rh,min]` with the exact definitions
`I_rh,min = 56.9 / (1 + 0.459/0.3) ≈ 22.49` and `R = 102.1 / 56.9 ≈ 1.794` (so that a 0.3 ms pulse recruits the
first unit at 56.9 and all units at 102.1; use these expressions, not rounded values), assigned in a seeded random order
(non-selective recruitment, Gregory & Bickel 2005); range inherited from the original model. The spike occurs at
the end of the pulse. A pulse is its **leading phase**: a run of same-sign current that starts after zero current; the
opposite phase of a biphasic pulse follows within the refractory period and is ignored. Fields: `amplitude`,
`pulseWidthUs` (or `dutyCyclePercent` and `frequencyHz` → PW), `seed`.

No refractoriness is modelled in this layer (FES only, no central drive): every suprathreshold pulse fires the axon,
however close to the previous one. The code justifies this by the periodic range (≤ 200 Hz, pulses ≥ 5 ms apart); an
explicit sequence can place pulses down to `phases·PW + stepMs` apart, where that justification no longer holds (an
open decision, not changed here). With a central drive the axon merge applies a 1.6 ms electrode refractory period
(`infrastructure/axon_merge.py`).

## 3. Conduction to the muscle — `domain/force_pipeline.py`, `domain/motor_unit_pool.py`

ORIGINAL (soma only): junction potential
`V_J = V_s · 0.070·λ/2 · e^{−x/λ}`, `λ = √(1/0.070)`, `x = axonLengthPercent/100`, after a 3×3 median filter.
Delay of unit `k` with conduction velocity `v_k` (APAT, read as m/s, 44–53) over the axon length `x` (m,
`axonLengthPercent/100`, i.e. 0.8 m at 80); `T = durationMs`, so the ORIGINAL delay in ms is `x/v·T` and the
LITERATURE delay is `x/v·1000` (18.18 ms at 44 m/s, 15.09 ms at 53 m/s for x = 0.8 m):

$$ \Delta_k = \frac{x}{v_k}\cdot \frac{T}{\delta t}\ \text{samples (ORIGINAL, Q4)} \qquad \Delta_k = \frac{x}{v_k}\cdot\frac{1000}{\delta t}\ \text{samples (LITERATURE)} $$

`δt = stepMs`. Fields: `axonLengthPercent`, `durationMs`, `stepMs`.

### Per-type unit parameters — `domain/motor_unit_pool.py` (`TYPE_RANGES`, from `createUMs.m`)

Within each type, values go linearly from the first to the last value across the muscle's pool; the simulated
units are the first ones (ORIGINAL) or the centres of equal slices (LITERATURE).

| Type | MT `P_k` (twitch peak) | MTTP `T_k` (ms, before the LITERATURE time scale) | APAT `v_k` (m/s) | APSF `S_k` | APTF `λ_m` |
|---|---|---|---|---|---|
| S | 0.103 → 0.123 | 110 → 100 | 44 → 47 | 0.105 → 0.125 | 0.8 → 0.7 |
| FR | 0.123 → 0.294 | 73.5 → 55.5 | 47 → 50 | 0.125 → 0.3 | 0.7 → 0.6 |
| FF | 0.294 → 0.491 | 82.3 → 56.9 | 50 → 53 | 0.3 → 0.5 | 0.6 → 0.5 |

Pool sizes (S / FR / FF): soleus 800 / 50 / 50, gastrocnemius medial 250 / 125 / 125, gastrocnemius lateral
200 / 100 / 100, tibialis anterior 250 / 50 / 50. Fatigue's `P_min` / `P_max` are the weakest and strongest MT
of the whole pool (0.103 / 0.491 for every muscle in the table).

## 4. Motor-unit action potential and EMG — `domain/force_pipeline.py`

At each spike (junction peak, or axon spike), unit `k` writes, `Δ_k` samples later, with `u = t/λ_m`,
`t ∈ [−1.25, 1.25]` ms:

$$ \text{MUAP}_k(t) = H \cdot S_k \cdot \begin{cases} t\, e^{-u^2} & \text{(shape 0)} \\ (1 - 2u^2)\, e^{-u^2} & \text{(shape 1)} \end{cases} $$

`H` = peak of `V_J` (ORIGINAL) or 1 (LITERATURE); `S_k` = APSF; `λ_m` = APTF; shape drawn per unit from `seed`.
EMG shown = sum over types of the mean MUAP.

## 5. Twitch — `domain/twitch.py`

5a (ORIGINAL, Fuglevand 1993): critically damped, `P_k` = MT, `T_k` = MTTP:
$$ h_k(t) = P_k \frac{t}{T_k} e^{1 - t/T_k} $$
5b (LITERATURE): generalised, `T_k` scaled and `m` fitted to the data chosen by `calibrationTarget`
(`model_options.TWITCH_CALIBRATION`): `WHOLE_MUSCLE` ×1.2772, `m = 3.9461` (whole human triceps surae: CT 120.7 ms,
HRT 97.3 ms); `SINGLE_UNIT` ×0.7426, `m = 2.0862` (mean of single human units, Macefield 1996: CT 74.8 ms,
HRT 78.6 ms):
$$ h_k(t) = P_k \left(\frac{t}{T_k}\right)^{m} e^{m(1 - t/T_k)} $$

Unit force = sum of twitches started by its drive spikes: ORIGINAL — peaks of the type's summed MUAP, weighted
by the peak value (Q2); LITERATURE — the unit's own spikes, weight 1.

## 6. Rate saturation (LITERATURE) — `twitch.RateGain` (Potvin & Fuglevand 2017, Eqs 4–6)

$$ NR = \frac{T_k}{\text{ISI}}, \qquad NF(NR) = \begin{cases} 0.3\,NR & NR \le 0.4 \\ 1 - e^{-2 NR^3} & NR > 0.4 \end{cases}, \qquad g = \frac{NF(NR)}{0.3\,NR} $$

Each twitch is multiplied by `g` (our derivation so that the twitch sum follows `NF`).

## 7. Fatigue (LITERATURE) — `domain/fatigue.py` (Potvin & Fuglevand 2017, Eqs 9–11, 14)

$$ FAT_k = 0.0125\cdot 180^{\frac{\ln(P_k/P_{min})}{\ln(P_{max}/P_{min})}}\ \%/s, \qquad \frac{dC_k}{dt} = -\frac{FAT_k\, NF(t)}{100}, \qquad T_k \leftarrow T_k\,(1 + 0.379\,(1 - C_k)) $$

`C_k` = remaining capacity (multiplies the twitch). Intervals with `NR < 0.25` are pauses (no fatigue). No recovery.

## 8. Muscle force — `domain/simulation.py`

8a (ORIGINAL): `F(t) = Σ_type mean_k f_k(t)` (Q7).
8b (LITERATURE): `F(t) = Σ_type (N_pool,type / N_sim,type) · Σ_k f_k(t)` — each simulated unit stands for its
share of the pool (soleus 800 / 50 / 50 simulated as 106 / 7 / 7).
