#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_global_coeziv_state.py

Aplică modelul coeziv (variantă globală) pe piața globală de active
folosind seriile din data_global/*.csv (SPX, VIX, DXY, GOLD, OIL)
și construiește fișierul data/global_coeziv_state.json.

Rezultatul este folosit de:
- ic_global.html  (IC_GLOBAL & ICD_GLOBAL + regim global)
- update_btc_state_latest_from_daily.py (risk_score / macro_signal)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_GLOBAL = ROOT / "data_global"
DATA_OUT = ROOT / "data"
OUTPUT_JSON = DATA_OUT / "global_coeziv_state.json"

SERIES = ["spx", "vix", "dxy", "gold", "oil"]

WINDOW_STRUCT = 120  # zile pentru corelații structurale
WINDOW_DIR = 60      # zile pentru direcționalitate


def log(msg: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[GlobalCoeziv] {now} | {msg}", flush=True)


def percentile_from_sorted(sorted_vals: List[float], value: float) -> float:
    if not sorted_vals:
        return 50.0
    import bisect
    pos = bisect.bisect_right(sorted_vals, value)
    return 100.0 * pos / len(sorted_vals)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class GlobalRegime:
    regime: str
    description: str


# ----------- citire serii globale -----------

def load_single_series(name: str) -> pd.Series:
    path = DATA_GLOBAL / f"{name}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Lipsește fișierul {path}")

    df = pd.read_csv(path)
    if "timestamp" not in df.columns or "close" not in df.columns:
        raise ValueError(f"{path} trebuie să aibă coloanele 'timestamp' și 'close'")

    ts = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    s = pd.Series(df["close"].astype(float).values, index=ts)
    return s.sort_index()


def load_all_series() -> pd.DataFrame:
    log("Încarc seriile globale din data_global/ ...")
    data: Dict[str, pd.Series] = {}
    for name in SERIES:
        data[name] = load_single_series(name)

    df = pd.concat(data, axis=1, join="inner").dropna()
    if len(df) < 260:
        raise RuntimeError("Prea puține date comune pentru seriile globale (min ~260 zile).")

    log(f"Interval comun: {df.index[0].date()} – {df.index[-1].date()} ({len(df)} zile)")
    return df


# ----------- IC_GLOBAL structural -----------

def compute_ic_global_structural(df: pd.DataFrame) -> pd.Series:
    rets = df.pct_change().dropna()
    assets = list(df.columns)

    if len(rets) < WINDOW_STRUCT:
        raise RuntimeError("Insuficiente date pentru fereastra structurală.")

    log(f"Calculez IC_GLOBAL structural (corelații, {WINDOW_STRUCT} zile)...")

    num_assets = len(assets)
    pair_count = num_assets * (num_assets - 1) // 2

    ic_raw = pd.Series(index=rets.index, dtype=float)
    ic_raw[:] = 0.0

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
    return ic_index


# ----------- ICD_GLOBAL direcțional -----------

def compute_icd_global_directional(df: pd.DataFrame) -> pd.Series:
    if len(df) < WINDOW_DIR + 1:
        raise RuntimeError("Insuficiente date pentru fereastra direcțională.")

    log(f"Calculez ICD_GLOBAL direcțional (randamente {WINDOW_DIR} zile)...")

    cum = {}
    for name in SERIES:
        series = df[name]
        base = series.shift(WINDOW_DIR)
        cum[name] = series / base - 1.0

    cum_df = pd.DataFrame(cum).dropna()

    w_spx, w_gold, w_oil, w_vix, w_dxy = 0.4, 0.15, 0.15, 0.15, 0.15

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
    return icd_index


# ----------- regim + scor risc -----------

def classify_global_regime(ic_val: float, icd_val: float) -> GlobalRegime:
    ic_low, ic_high = 40.0, 65.0
    icd_low, icd_high = 40.0, 60.0

    if ic_val >= ic_high and icd_val >= icd_high:
        return GlobalRegime(
            regime="bull",
            description="Regim global bullish: structură coerentă + fluxuri pro-risc."
        )
    if ic_val >= ic_high and icd_val <= icd_low:
        return GlobalRegime(
            regime="bear",
            description="Regim global bearish/defensiv: structură ridicată, orientare spre refugii."
        )
    return GlobalRegime(
        regime="neutral",
        description="Fază de tranziție: structură și direcționalitate amestecate."
    )


def compute_risk_score_and_macro(ic_val: float, icd_val: float) -> Tuple[float, str]:
    s_norm = (ic_val - 50.0) / 50.0
    d_norm = (icd_val - 50.0) / 50.0
    risk_score = clamp(0.3 * s_norm + 0.7 * d_norm, -1.0, 1.0)

    if risk_score > 0.15:
        macro_signal = "risk-on"
    elif risk_score < -0.15:
        macro_signal = "risk-off"
    else:
        macro_signal = "echilibrat"
    return risk_score, macro_signal


# ----------- orchestrare -----------

def main() -> None:
    log("Pornesc build_global_coeziv_state.py")

    df = load_all_series()
    ic_series = compute_ic_global_structural(df)
    icd_series = compute_icd_global_directional(df)

    common_index = ic_series.index.intersection(icd_series.index)
    ic_series = ic_series.loc[common_index]
    icd_series = icd_series.loc[common_index]

    if not len(common_index):
        raise RuntimeError("Nu există intersecție de date IC/ICD.")

    records: List[Dict[str, float]] = []
    for ts in common_index:
        t_ms = int(ts.timestamp() * 1000)
        ic_val = float(ic_series.loc[ts])
        icd_val = float(icd_series.loc[ts])
        records.append({
            "t": t_ms,
            "ic_global": round(ic_val, 2),
            "icd_global": round(icd_val, 2),
        })

    records.sort(key=lambda x: x["t"])
    current = records[-1]
    ic_val, icd_val = current["ic_global"], current["icd_global"]

    regime = classify_global_regime(ic_val, icd_val)
    risk_score, macro_signal = compute_risk_score_and_macro(ic_val, icd_val)

    current["regime"] = regime.regime

    thresholds = {
        "ic_low": 40.0,
        "ic_high": 65.0,
        "icd_low": 40.0,
        "icd_high": 60.0,
    }

    as_of_date = datetime.fromtimestamp(current["t"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

    payload = {
        "as_of": as_of_date,
        "risk_score": round(risk_score, 4),
        "macro_signal": macro_signal,
        "series": records,
        "current": current,
        "thresholds": thresholds,
        "meta": {
            "source": "coeziv-global-python",
            "window_struct_days": WINDOW_STRUCT,
            "window_dir_days": WINDOW_DIR,
            "description": (
                "IC_GLOBAL structural din corelații multi-asset, "
                "ICD_GLOBAL direcțional din randamente cumulative risk-on vs risk-off."
            ),
        },
    }

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    log(f"Am scris {len(records)} puncte în {OUTPUT_JSON.relative_to(ROOT)}")
    log(
        f"Stare curentă: IC_GLOBAL={ic_val:.2f}, "
        f"ICD_GLOBAL={icd_val:.2f}, regim={regime.regime}, "
        f"risk_score={risk_score:.3f}, macro_signal={macro_signal}"
    )


if __name__ == "__main__":
    main()
