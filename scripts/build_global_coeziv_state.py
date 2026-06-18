#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_global_coeziv_state.py

Model Coeziv extins pentru piața globală de active.

- Folosește seriile din data_global/*.csv (SPX, VIX, DXY, GOLD, OIL),
  descărcate anterior cu update_global_coeziv_state.py.
- Calculează:
    * IC_GLOBAL  (structură)  – coeziunea internă între pieţe (corelaţii)
    * ICD_GLOBAL (direcţie)   – fluxul de risc global (risk-on vs risk-off)
    * energie de fază coezivă (sinus pe 2π)
    * risk_score global (-1 … +1)
    * macro_signal: "risk-on" / "risk-off" / "echilibrat"
    * regim global: "bull" / "bear" / "neutral"

Rezultatul este serializat în data/global_coeziv_state.json
şi este folosit de:
- ic_global.html
- update_btc_state_latest_from_daily.py

Patch 2026:
- nu mai blochează latest.date la ultima zi comună perfectă a tuturor seriilor;
- folosește concat outer + forward-fill limitat pentru diferențe de calendar;
- refuză să publice JSON gol sau fără latest/series;
- scrie atomic, ca un build eșuat să nu suprascrie ultimul JSON valid.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


# ---- locaţii fişiere --------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DATA_GLOBAL = ROOT / "data_global"
DATA_OUT = ROOT / "data"
OUTPUT_JSON = DATA_OUT / "global_coeziv_state.json"

# numele fişierelor din data_global/*.csv
SERIES = ["spx", "vix", "dxy", "gold", "oil"]

# ferestre temporale (în zile)
WINDOW_STRUCT = 120  # structură / corelaţii
WINDOW_DIR = 60      # direcţionalitate / fluxuri de risc

# toleranță pentru piețe cu calendar diferit / sărbători / weekend
MAX_FORWARD_FILL_ROWS = 7
MAX_LATEST_STALENESS_DAYS = 10
MIN_SERIES_COUNT = 260


# ---- utilitare --------------------------------------------------------------

def log(msg: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[GlobalCoeziv] {now} | {msg}", flush=True)


def percentile_from_sorted(sorted_vals: List[float], value: float) -> float:
    """Percentilă dintr-o listă sortată (0–100)."""
    if not sorted_vals:
        return 50.0

    import bisect

    pos = bisect.bisect_right(sorted_vals, value)
    return 100.0 * pos / len(sorted_vals)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def json_safe_float(value: float) -> float:
    v = float(value)
    if not np.isfinite(v):
        raise ValueError(f"Valoare numerică nevalidă pentru JSON: {value!r}")
    return v


@dataclass
class GlobalRegime:
    regime: str
    description: str


# ---- citire serii globale ---------------------------------------------------

def load_single_series(name: str) -> pd.Series:
    """
    Încarcă o serie din data_global/<name>.csv.

    Acceptă formate CSV de tip:
    1. date,close
    2. datetime,close
    3. time,close
    4. timestamp,close unde timestamp este UNIX real în milisecunde sau secunde

    Protecție:
    - Dacă timestamp-ul este doar 0,1,2,3..., scriptul NU îl tratează ca dată reală,
      ca să nu mai apară greșit 1970-01-01.
    """
    path = DATA_GLOBAL / f"{name}.csv"

    if not path.exists():
        raise FileNotFoundError(f"Lipsește fișierul {path}")

    df = pd.read_csv(path)
    original_columns = list(df.columns)

    # Normalizează numele coloanelor
    df.columns = [str(c).strip().lower() for c in df.columns]

    # Detectare coloană de preț
    close_col = None
    for candidate in ["close", "adj close", "adj_close", "price", "value"]:
        if candidate in df.columns:
            close_col = candidate
            break

    if close_col is None:
        raise ValueError(
            f"{path} nu are coloană de preț validă. "
            f"Coloane găsite: {original_columns}"
        )

    # Detectare coloană de dată
    date_col = None
    for candidate in ["date", "datetime", "time"]:
        if candidate in df.columns:
            date_col = candidate
            break

    if date_col is not None:
        ts = pd.to_datetime(df[date_col], errors="coerce", utc=True)

    elif "timestamp" in df.columns:
        raw_ts = pd.to_numeric(df["timestamp"], errors="coerce")
        raw_clean = raw_ts.dropna()

        if raw_clean.empty:
            raise ValueError(f"{path}: coloana timestamp nu conține valori numerice valide.")

        max_ts = float(raw_clean.max())

        # UNIX epoch în milisecunde. Exemplu 2026 ≈ 1_765_000_000_000
        if max_ts > 1_000_000_000_000:
            ts = pd.to_datetime(raw_ts, unit="ms", errors="coerce", utc=True)

        # UNIX epoch în secunde. Exemplu 2026 ≈ 1_765_000_000
        elif max_ts > 1_000_000_000:
            ts = pd.to_datetime(raw_ts, unit="s", errors="coerce", utc=True)

        else:
            raise ValueError(
                f"{path}: coloana timestamp pare să fie index numeric, nu dată reală. "
                f"Max timestamp={max_ts}. "
                "Corectează scripts/update_global_coeziv_state.py ca să salveze "
                "coloana date sau timestamp UNIX real."
            )

    else:
        raise ValueError(
            f"{path} nu are coloană de dată validă. "
            f"Trebuie una dintre: date, datetime, time sau timestamp. "
            f"Coloane găsite: {original_columns}"
        )

    close = pd.to_numeric(df[close_col], errors="coerce")

    clean = pd.DataFrame({
        "timestamp": ts,
        "close": close,
    }).dropna(subset=["timestamp", "close"])

    if clean.empty:
        raise RuntimeError(f"{path}: nu au rămas date valide după curățare.")

    clean = clean.sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")

    s = pd.Series(
        clean["close"].to_numpy(dtype=float),
        index=clean["timestamp"],
        name=name,
    ).dropna().sort_index()

    if s.index.has_duplicates:
        s = s[~s.index.duplicated(keep="last")]

    log(f"  • {name}: încărcat {len(s)} puncte | {s.index[0].date()} – {s.index[-1].date()}")

    return s


def load_all_series() -> pd.DataFrame:
    """
    Concatenează seriile într-un singur DataFrame:
       index = dată, coloane = ['spx', 'vix', 'dxy', 'gold', 'oil']

    Folosește OUTER JOIN + forward-fill limitat. Astfel, latest nu rămâne blocat
    la ultima zi perfect comună dacă o singură piață are calendar diferit.
    """
    log("Încarc seriile globale din data_global/ ...")

    data: Dict[str, pd.Series] = {}

    for name in SERIES:
        data[name] = load_single_series(name)

    raw = pd.concat(data, axis=1, join="outer").sort_index()
    raw = raw[~raw.index.duplicated(keep="last")]

    if raw.empty:
        raise RuntimeError("Nu există date globale brute în data_global/*.csv.")

    latest_available = {name: data[name].index[-1] for name in SERIES}
    max_raw_date = max(latest_available.values())

    for name, ts in latest_available.items():
        age_days = (max_raw_date - ts).days
        if age_days > MAX_LATEST_STALENESS_DAYS:
            raise RuntimeError(
                f"Seria {name} este prea veche față de ultima piață disponibilă: "
                f"{ts.date()} vs {max_raw_date.date()} ({age_days} zile)."
            )

    # Completează golurile scurte de calendar, dar nu inventează luni de date.
    df = raw.ffill(limit=MAX_FORWARD_FILL_ROWS).dropna(subset=SERIES)

    if len(df) < MIN_SERIES_COUNT:
        raise RuntimeError(
            f"Prea puține date globale după aliniere: {len(df)} zile. "
            f"Minim recomandat: {MIN_SERIES_COUNT} zile."
        )

    latest_row = df.index[-1]
    staleness = (max_raw_date - latest_row).days
    if staleness > MAX_LATEST_STALENESS_DAYS:
        raise RuntimeError(
            f"Ultimul rând calculabil este prea vechi: {latest_row.date()} "
            f"față de ultima dată brută {max_raw_date.date()} ({staleness} zile)."
        )

    log(
        f"Interval calculabil: {df.index[0].date()} – {df.index[-1].date()} "
        f"({len(df)} zile, outer+ffill limit={MAX_FORWARD_FILL_ROWS})"
    )

    source_dates = ", ".join(f"{k}={v.date()}" for k, v in latest_available.items())
    log(f"Ultimele date brute: {source_dates}")

    return df


# ---- IC_GLOBAL structură (coeziune între pieţe) ------------------------------

def compute_ic_global_structural(df: pd.DataFrame) -> pd.Series:
    """
    IC_GLOBAL: măsoară coeziunea structurală dintre pieţele de active
    folosind media corelaţiilor absolute dintre randamentele zilnice,
    pe o fereastră rulantă de WINDOW_STRUCT zile, normalizată pe 0–100.
    """
    rets = df.pct_change().dropna()
    assets = list(df.columns)

    if len(rets) < WINDOW_STRUCT:
        raise RuntimeError("Insuficiente date pentru fereastra structurală.")

    log(f"Calculez IC_GLOBAL structural (corelații, {WINDOW_STRUCT} zile)...")

    num_assets = len(assets)
    pair_count = num_assets * (num_assets - 1) // 2

    ic_raw = pd.Series(index=rets.index, dtype=float)
    ic_raw[:] = 0.0

    # sumă de |corr| pe toate perechile
    for i in range(num_assets):
        for j in range(i + 1, num_assets):
            a, b = assets[i], assets[j]
            c = rets[a].rolling(WINDOW_STRUCT).corr(rets[b]).abs()
            ic_raw = ic_raw.add(c, fill_value=0.0)

    ic_raw = (ic_raw / float(pair_count)).dropna()

    hist_vals = [float(x) for x in ic_raw.values if np.isfinite(x)]
    sorted_hist = sorted(hist_vals)

    ic_idx_vals: Dict[pd.Timestamp, float] = {}

    for ts, v in ic_raw.items():
        if not np.isfinite(v):
            continue

        p = percentile_from_sorted(sorted_hist, float(v))
        ic_idx_vals[ts] = clamp(p, 0.0, 100.0)

    ic_index = pd.Series(ic_idx_vals).sort_index()
    ic_index.name = "ic_global"

    log(f"IC_GLOBAL calculat: {len(ic_index)} puncte")

    return ic_index


# ---- ICD_GLOBAL direcțional (flux de risc) -----------------------------------

def compute_icd_global_directional(df: pd.DataFrame) -> pd.Series:
    """
    ICD_GLOBAL: direcţionalitatea globală (bias de risc) definită ca
    randament cumulativ pe 60 de zile al unui coş:
      + SPX, GOLD, OIL  (active ciclice / pro-creștere)
      - VIX, DXY        (tensiune / presiune defensivă)
    Normalizăm apoi în percentilă 0–100.
    """
    if len(df) < WINDOW_DIR + 1:
        raise RuntimeError("Insuficiente date pentru fereastra direcțională.")

    log(f"Calculez ICD_GLOBAL direcțional (randamente {WINDOW_DIR} zile)...")

    cum = {}

    for name in SERIES:
        series = df[name]
        base = series.shift(WINDOW_DIR)
        cum[name] = series / base - 1.0

    cum_df = pd.DataFrame(cum).dropna()

    # ponderi pentru coşul de risc global
    w_spx, w_gold, w_oil, w_vix, w_dxy = 0.40, 0.15, 0.15, 0.15, 0.15

    dir_raw = (
        w_spx * cum_df["spx"]
        + w_gold * cum_df["gold"]
        + w_oil * cum_df["oil"]
        - w_vix * cum_df["vix"]
        - w_dxy * cum_df["dxy"]
    ).dropna()

    hist_vals = [float(x) for x in dir_raw.values if np.isfinite(x)]
    sorted_hist = sorted(hist_vals)

    icd_vals: Dict[pd.Timestamp, float] = {}

    for ts, v in dir_raw.items():
        if not np.isfinite(v):
            continue

        p = percentile_from_sorted(sorted_hist, float(v))
        icd_vals[ts] = clamp(p, 0.0, 100.0)

    icd_index = pd.Series(icd_vals).sort_index()
    icd_index.name = "icd_global"

    log(f"ICD_GLOBAL calculat: {len(icd_index)} puncte")

    return icd_index


# ---- praguri dinamice & fază coezivă ----------------------------------------

def dynamic_thresholds(ic_series: pd.Series, icd_series: pd.Series) -> Dict[str, float]:
    """
    Praguri nu sunt hardcodate, ci extrase din distribuţia istorică.
    Folosim percentile 30 / 70 pentru IC şi ICD.
    """
    ic_vals = np.array(ic_series.values, dtype=float)
    icd_vals = np.array(icd_series.values, dtype=float)

    return {
        "ic_low": json_safe_float(np.percentile(ic_vals, 30)),
        "ic_high": json_safe_float(np.percentile(ic_vals, 70)),
        "icd_low": json_safe_float(np.percentile(icd_vals, 30)),
        "icd_high": json_safe_float(np.percentile(icd_vals, 70)),
    }


def coeziv_phase(ic: float, icd: float) -> float:
    """
    Fază coezivă globală în [0, 2π], derivată din structură & direcţionalitate.
    Folosim produsul normalizat al indicilor ca „densitate de coeziune”.
    """
    ic_n = clamp(ic / 100.0, 0.0, 1.0)
    icd_n = clamp(icd / 100.0, 0.0, 1.0)

    # fază 0…2π
    return 2.0 * np.pi * (ic_n * icd_n)


def coeziv_energy(ic: float, icd: float) -> float:
    """
    Energia de fază coezivă:
      E = sin(phase)

    E > 0   → expansiune / risk-on
    E < 0   → contracţie / risk-off
    """
    phase = coeziv_phase(ic, icd)
    return float(np.sin(phase))


def classify_global_regime_coeziv(ic_val: float, icd_val: float) -> GlobalRegime:
    """
    Regim global în modelul coeziv:
      - bull   : energie > +0.35
      - bear   : energie < -0.35
      - neutral: altfel
    """
    energy = coeziv_energy(ic_val, icd_val)

    if energy > 0.35:
        return GlobalRegime(
            regime="bull",
            description="Piața globală are structură coerentă și fază de expansiune: modelul indică un mediu constructiv, favorabil asumării de risc."
        )

    if energy < -0.35:
        return GlobalRegime(
            regime="bear",
            description="Piața globală pare sus și bine aliniată, dar faza coezivă indică maturitate și tensiune: riscul principal este răcirea sau reducerea expunerii, nu accelerarea creșterii."
        )

    return GlobalRegime(
        regime="neutral",
        description="Piața globală este într-o zonă de tranziție: structura și impulsul există, dar modelul nu indică încă o direcție finală dominantă."
    )


def compute_risk_score_and_macro(ic_val: float, icd_val: float) -> Tuple[float, str]:
    """
    Risk score global derivat direct din energia de fază coezivă:
        risk_score = sin(phase) ∈ [-1, +1]
    """
    energy = coeziv_energy(ic_val, icd_val)
    risk_score = clamp(energy, -1.0, 1.0)

    if risk_score > 0.2:
        macro_signal = "risk-on"
    elif risk_score < -0.2:
        macro_signal = "risk-off"
    else:
        macro_signal = "echilibrat"

    return risk_score, macro_signal


def validate_state(state: Dict[str, object]) -> None:
    """Nu permite publicarea unui JSON gol sau structural invalid."""
    if not isinstance(state, dict):
        raise RuntimeError("State invalid: nu este obiect JSON.")

    latest = state.get("latest")
    series = state.get("series")

    if not isinstance(latest, dict) or not latest.get("date"):
        raise RuntimeError("State invalid: lipsește latest/date.")

    if not isinstance(series, list) or len(series) < MIN_SERIES_COUNT:
        raise RuntimeError(
            f"State invalid: series are {len(series) if isinstance(series, list) else 'N/A'} puncte."
        )

    for key in ["ic_global", "icd_global", "risk_score"]:
        value = latest.get(key)
        if value is None or not np.isfinite(float(value)):
            raise RuntimeError(f"State invalid: latest.{key} este nevalid ({value!r}).")


def write_state_atomically(state: Dict[str, object]) -> None:
    validate_state(state)

    DATA_OUT.mkdir(parents=True, exist_ok=True)

    text = json.dumps(state, ensure_ascii=False, indent=2)
    parsed = json.loads(text)
    validate_state(parsed)

    if len(text.strip()) < 200:
        raise RuntimeError("Refuz să scriu global_coeziv_state.json: conținut prea scurt.")

    tmp_path = OUTPUT_JSON.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")

    tmp_path.replace(OUTPUT_JSON)


# ---- orchestrare ------------------------------------------------------------

def main() -> None:
    log("Pornesc build_global_coeziv_state.py (model coeziv extins)")

    df = load_all_series()

    ic_series = compute_ic_global_structural(df)
    icd_series = compute_icd_global_directional(df)

    # aliniază pe acelaşi index
    common_index = ic_series.index.intersection(icd_series.index)
    ic_series = ic_series.loc[common_index]
    icd_series = icd_series.loc[common_index]

    if not len(common_index):
        raise RuntimeError("Nu există intersecție de date IC/ICD.")

    log(f"Intersecție IC/ICD: {len(common_index)} puncte")

    records: List[Dict[str, object]] = []

    for ts in common_index:
        t_ms = int(ts.timestamp() * 1000)
        ic_val = json_safe_float(ic_series.loc[ts])
        icd_val = json_safe_float(icd_series.loc[ts])

        regime = classify_global_regime_coeziv(ic_val, icd_val)
        risk_score, macro_signal = compute_risk_score_and_macro(ic_val, icd_val)
        energy = json_safe_float(coeziv_energy(ic_val, icd_val))
        phase = json_safe_float(coeziv_phase(ic_val, icd_val))

        records.append({
            "t": t_ms,
            "date": ts.strftime("%Y-%m-%d"),
            "ic_global": ic_val,
            "icd_global": icd_val,
            "coeziv_phase": phase,
            "coeziv_energy": energy,
            "risk_score": json_safe_float(risk_score),
            "macro_signal": macro_signal,
            "global_regime": regime.regime,
        })

    latest_ts = common_index[-1]
    latest_ic = json_safe_float(ic_series.loc[latest_ts])
    latest_icd = json_safe_float(icd_series.loc[latest_ts])
    latest_regime = classify_global_regime_coeziv(latest_ic, latest_icd)
    latest_risk_score, latest_macro_signal = compute_risk_score_and_macro(latest_ic, latest_icd)
    latest_energy = json_safe_float(coeziv_energy(latest_ic, latest_icd))
    latest_phase = json_safe_float(coeziv_phase(latest_ic, latest_icd))

    thresholds = dynamic_thresholds(ic_series, icd_series)

    state: Dict[str, object] = {
        "model": "global_coeziv_state",
        "version": "1.5",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "folder": "data_global",
            "series": SERIES,
            "window_struct": WINDOW_STRUCT,
            "window_dir": WINDOW_DIR,
            "alignment": "outer_join_forward_fill_limited",
            "max_forward_fill_rows": MAX_FORWARD_FILL_ROWS,
            "max_latest_staleness_days": MAX_LATEST_STALENESS_DAYS,
            "output": "data/global_coeziv_state.json",
        },
        "latest": {
            "t": int(latest_ts.timestamp() * 1000),
            "date": latest_ts.strftime("%Y-%m-%d"),
            "ic_global": latest_ic,
            "icd_global": latest_icd,
            "coeziv_phase": latest_phase,
            "coeziv_energy": latest_energy,
            "risk_score": json_safe_float(latest_risk_score),
            "macro_signal": latest_macro_signal,
            "global_regime": latest_regime.regime,
            "description": latest_regime.description,
        },
        "thresholds": thresholds,
        "series_count": len(records),
        "series": records,
    }

    write_state_atomically(state)

    log(f"✅ Salvat {OUTPUT_JSON}")
    log(
        "Latest global state: "
        f"date={state['latest']['date']}, "
        f"IC={latest_ic:.2f}, "
        f"ICD={latest_icd:.2f}, "
        f"energy={latest_energy:.3f}, "
        f"risk_score={latest_risk_score:.3f}, "
        f"signal={latest_macro_signal}, "
        f"regime={latest_regime.regime}"
    )


if __name__ == "__main__":
    main()
