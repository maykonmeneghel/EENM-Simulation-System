# Model equations (single source for the UI's "Equações" view)

What the engine actually computes, per `modelVariant`. Every equation names the code that implements it and
the request fields (`camelCase`) or constants it uses, so the UI can show it with the current values.
Units: time in ms, voltage in mV, current in the stimulus amplitude units (µA/cm² for the soma model).

Stages, in order: **1 Stimulus → 2 Excitation (motoneuron *or* motor axon) → 3 Conduction → 4 MUAP / EMG →
5 Twitch → 6 Rate saturation → 7 Fatigue → 8 Muscle force.** `ORIGINAL` uses 1, 2a, 3, 4, 5a, 8a;
`LITERATURE` uses 1, 2b, 3b, 4, 5b, 6, 7, 8b.

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

## 2a. Motoneuron (ORIGINAL) — `domain/motoneuron.py` (port of `rates.m`)

Two compartments per unit, soma `V_s` and dendrite `V_d`, coupled through `g_c` and the soma-area fraction
`p = A_s/(A_s + A_d)` (from the unit's geometry):

$$ C_s \frac{dV_s}{dt} = I_{s} - g_{Na}\, m_\infty^3(V_s)\, h\,(V_s - E_{Na}) - g_{Ca}\, m_{Ca}^2 h_{Ca}(V_s - E_{Ca}) - g_K\, n^4 (V_s - E_K) - g_{KCa}\frac{[Ca]_s}{K_d + [Ca]_s}(V_s - E_K) - g_L (V_s - E_L) + \frac{g_c}{p}(V_d - V_s) $$

$$ C_d \frac{dV_d}{dt} = I_{d} - g_{Ca,d}\, m_{Ca,d}(V_d - E_{Ca}) - g_{NaP}\, m_{NaP} h_{NaP}(V_d - E_{Na}) - g_{KCa,d}\frac{[Ca]_d}{K_d + [Ca]_d}(V_d - E_K) - g_L (V_d - E_L) + \frac{g_c}{1-p}(V_s - V_d) $$

Gates relax as `dx/dt = φ (x_∞(V) − x)/τ_x(V)`, `φ = 3^{(T_°C − 6.3)/10}`; calcium
`d[Ca]/dt = φ(−f α I_Ca − f k_Ca [Ca])`. `I_s = I(t)` when `injectionSite = SOMA`, else `I_d = I(t)`.
Constants (`Conductances`): `E_Na = 55, E_K = −80, E_L = −60, E_Ca = 80 mV` (as `v + v_rest`), `g_Na = 80,
g_K = 100, g_Ca = 14, g_KCa = 6, g_L = 0.51, g_c = 0.1, g_NaP = 0.1, g_Ca,d = 0.25`, `C = 1`.

Fields: `injectionSite`, `temperatureCelsius`, `somaGeometry`, `dendriteGeometry`, `muscle`, `unitsPerType`.

## 2b. Motor axon (LITERATURE) — `domain/axon_stimulation.py`

Each axon `k` has a rheobase `I_rh,k`; a pulse of width `PW` and amplitude `A` fires it when (Weiss):

$$ A \;\ge\; I_{rh,k}\left(1 + \frac{\tau_{SD}}{PW}\right), \qquad \tau_{SD} = 0.459\ \text{ms} \;\text{(Mogyoros et al. 1996)} $$

`I_rh,k` spread linearly over `[I_rh,min, 1.79·I_rh,min]`, `I_rh,min = 22.5`, assigned in a seeded random order
(non-selective recruitment, Gregory & Bickel 2005); range inherited from the original model. The spike occurs at
the end of the pulse. Fields: `amplitude`, `dutyCyclePercent` and `frequencyHz` (→ PW), `seed`.

## 3. Conduction to the muscle — `domain/force_pipeline.py`, `domain/motor_unit_pool.py`

ORIGINAL (soma only): junction potential
`V_J = V_s · 0.070·λ/2 · e^{−x/λ}`, `λ = √(1/0.070)`, `x = axonLengthPercent/100`, after a 3×3 median filter.
Delay of unit `k` with velocity `v_k` (APAT, 44–53 m/s):

$$ \Delta_k = \frac{x}{v_k}\cdot \frac{T}{\delta t}\ \text{samples (ORIGINAL, Q4)} \qquad \Delta_k = \frac{x}{v_k}\cdot\frac{1000}{\delta t}\ \text{samples (LITERATURE)} $$

`δt = stepMs`. Fields: `axonLengthPercent`, `durationMs`, `stepMs`.

## 4. Motor-unit action potential and EMG — `domain/force_pipeline.py`

At each spike (junction peak, or axon spike), unit `k` writes, `Δ_k` samples later, with `u = t/λ_m`,
`t ∈ [−1.25, 1.25]` ms:

$$ \text{MUAP}_k(t) = H \cdot S_k \cdot \begin{cases} t\, e^{-u^2} & \text{(shape 0)} \\ (1 - 2u^2)\, e^{-u^2} & \text{(shape 1)} \end{cases} $$

`H` = peak of `V_J` (ORIGINAL) or 1 (LITERATURE); `S_k` = APSF; `λ_m` = APTF; shape drawn per unit from `seed`.
EMG shown = sum over types of the mean MUAP.

## 5. Twitch — `domain/twitch.py`

5a (ORIGINAL, Fuglevand 1993): critically damped, `P_k` = MT, `T_k` = MTTP:
$$ h_k(t) = P_k \frac{t}{T_k} e^{1 - t/T_k} $$
5b (LITERATURE): generalised, `T_k` scaled ×1.2772, `m = 3.9461` (fitted to human soleus: CT 120.7 ms, HRT 97.3 ms):
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
