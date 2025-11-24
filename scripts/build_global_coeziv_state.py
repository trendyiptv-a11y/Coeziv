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
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_GLOBAL = ROOT / "data_global"
DATA_OUT = ROOT / "data"
OUTPUT_JSON = DATA_OUT / "global_coeziv_state.json"

# Nume fișiere din data_global (generate de update_global_coeziv_state.py)
SERIES = ["spx", "vix", "dxy", "gold", "oil"]

# Parametri model
WINDOW_STRUCT = 120  # zile pentru corelații structurale
WINDOW_DIR = 60      # zile pentru direcționalitate (randamente cumulative)


# ---------- utilitare ----------

def log(msg: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[GlobalCoeziv] {now} | {msg}", flush=True)


def percentile_from_sorted(sorted_vals: List[float], value: float) -> float:
    """
    Percentila poziției lui `value` într-un vector deja sortat.
    0 = cel mai mic, 100 = cel mai mare.
    """
    if not sorted_vals:
        return 50.0
    import bisect

    pos = bisect.bisect_right(sorted_vals, value)
    return 100.0 * pos / len(sorted_vals)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class GlobalRegime:
    regime: str           # "bull" / "bear" / "neutral"
    description: str      # scurt text descriptiv


# ---------- citire serii globale ----------

def load_single_series(name: str) -> pd.Series:
    """
    Citește data_global/<name>.csv (timestamp, close) și întoarce
    o serie pandas cu index datetime UTC și valori close.
    """
    path = DATA_GLOBAL / f"{name}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Lipsește fișierul {path}")

    df = pd.read_csv(path)
    if "timestamp" not in df.columns or "close" not in df.columns:
        raise ValueError(f"{path} trebuie să conțină coloanele 'timestamp' și 'close'")

    ts = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    s = pd.Series(df["close"].astype(float).values, index=ts)
    s = s.sort_index()
    return s


def load_all_series() -> pd.DataFrame:
    """
    Construiește DataFrame cu coloanele: spx, vix, dxy, gold, oil.
    Index = date comune (intersecție) pentru toate seriile.
    """
    log("Încarc seriile globale din data_global/ ...")
    data: Dict[str, pd.Series] = {}
    for name in SERIES:
        data[name] = load_single_series(name)

    # intersecție de date ca să lucrăm doar pe interval comun
    df = pd.concat(data, axis=1, join="inner").dropna()
    if len(df) < 260:
        raise RuntimeError("Prea puține date comune pentru seriile globale (minim ~260 zile).")

    log(f"Serii globale încărcate; interval: {df.index[0].date()} – {df.index[-1].date()}, n={len(df)}")
    return df


# ---------- calcul IC_GLOBAL structural (corelații) ----------

def compute_ic_global_structural(df: pd.DataFrame) -> pd.Series:
    """
    IC_GLOBAL structural:
    - folosim randamentele zilnice ale seriilor (log-return/pct change)
    - calculăm corelațiile rulante pe WINDOW_STRUCT zile
    - IC_GLOBAL(t) = media absolută a corelațiilor între toate perechile de active
    - apoi normalizăm în 0–100 (percentile pe istoric)
    """
    rets = df.pct_change().dropna()
    assets = list(df.columns)

    if len(rets) < WINDOW_STRUCT:
        raise RuntimeError("Insuficiente date pentru fereastra structurală.")

    log(f"Calculez IC_GLOBAL structural pe fereastră de {WINDOW_STRUCT} zile...")

    # media |corr| între toate perechile (i<j)
    num_assets = len(assets)
    pair_count = num_assets * (num_assets - 1) // 2

    ic_raw = pd.Series(index=rets.index, dtype=float)
    ic_raw[:] = 0.0

    for i in range(num_assets):
        for j in range(i + 1, num_assets):
            a, b = assets[i], assets[j]
            c = rets[a].rolling(WINDOW_STRUCT).corr(rets[b]).abs()
            ic_raw = ic_raw.add(c, fill_value=0.0)

    ic_raw = ic_raw / float(pair_count)
    ic_raw = ic_raw.dropna()

    # normalizare 0–100 pe istoricul complet
    hist_vals = [float(x) for x in ic_raw.values if np.isfinite(x)]
    sorted_hist = sorted(hist_vals)

    ic_index_vals: Dict[pd.Timestamp, float] = {}
    for ts, v in ic_raw.items():
        if not np.isfinite(v):
            continue
        p = percentile_from_sorted(sorted_hist, float(v))
        ic_index_vals[ts] = clamp(p, 0.0, 100.0)

    ic_index = pd.Series(ic_index_vals).sort_index()
    ic_index.name = "ic_global"
    return ic_index


# ---------- calcul ICD_GLOBAL direcțional ----------

def compute_icd_global_directional(df: pd.DataFrame) -> pd.Series:
    """
    ICD_GLOBAL direcțional:
    - randamente cumulative pe 60 de zile pentru fiecare activ
    - combinăm risk-on (SPX, GOLD, OIL) și risk-off (VIX, DXY) cu semne opuse
    - normalizare în 0–100 pe tot istoricul (percentile)
    """
    if len(df) < WINDOW_DIR + 1:
        raise RuntimeError("Insuficiente date pentru fereastra direcțională.")

    log(f"Calculez ICD_GLOBAL direcțional pe fereastră de {WINDOW_DIR} zile...")

    # randamente cumulative simple: close_t / close_{t-W} - 1
    cum = {}
    for name in SERIES:
        series = df[name]
        base = series.shift(WINDOW_DIR)
        cum[name] = series / base - 1.0

    cum_df = pd.DataFrame(cum).dropna()

    # ponderi: risc vs defensiv
    w_spx = 0.4
    w_gold = 0.15
    w_oil = 0.15
    w_vix = 0.15
    w_dxy = 0.15

    dir_raw = (
        w_spx * cum_df["spx"]
        + w_gold * cum_df["gold"]
        + w_oil * cum_df["oil"]
        - w_vix * cum_df["vix"]
        - w_dxy * cum_df["dxy"]
    )

    dir_raw = dir_raw.dropna()

    hist_vals = [float(x) for x in dir_raw.values if np.isfinite(x)]
    sorted_hist = sorted(hist_vals)

    icd_index_vals: Dict[pd.Timestamp, float] = {}
    for ts, v in dir_raw.items():
        if not np.isfinite(v):
            continue
        p = percentile_from_sorted(sorted_hist, float(v))
        icd_index_vals[ts] = clamp(p, 0.0, 100.0)

    icd_index = pd.Series(icd_index_vals).sort_index()
    icd_index.name = "icd_global"
    return icd_index


# ---------- regim global + scor de risc ----------

def classify_global_regime(ic_val: float, icd_val: float) -> GlobalRegime:
    """
    Schemă simplă, aliniată cu front-end:
    - IC_GLOBAL mare + ICD_GLOBAL mare -> bull
    - IC_GLOBAL mare + ICD_GLOBAL mic  -> bear defensiv
    - restul -> neutral / tranziție
    Praguri: 40/65 pentru structură, 40/60 pentru direcțional.
    """
    ic_low, ic_high = 40.0, 65.0
    icd_low, icd_high = 40.0, 60.0

    if ic_val >= ic_high and icd_val >= icd_high:
        return GlobalRegime(
            regime="bull",
            description="Regim global bullish: structură coerentă + fluxuri orientate spre risc.",
        )
    if ic_val >= ic_high and icd_val <= icd_low:
        return GlobalRegime(
            regime="bear",
            description="Regim global bearish / defensiv: structură ridicată dar orientare spre refugii.",
        )
    return GlobalRegime(
        regime="neutral",
        description="Fază de tranziție: structură și direcționalitate amestecate.",
    )


def compute_risk_score_and_macro(ic_val: float, icd_val: float) -> Tuple[float, str]:
    """
    Derivăm un scor de risc global (-1..1) și un semnal text:
      - s_norm: structură normalizată ([-1,1])
      - d_norm: direcționalitate normalizată ([-1,1])
      - risk_score = 0.3 * s_norm + 0.7 * d_norm
    """
    s_norm = (ic_val - 50.0) / 50.0  # [-1..1] aproximativ
    d_norm = (icd_val - 50.0) / 50.0

    risk_score = clamp(0.3 * s_norm + 0.7 * d_norm, -1.0, 1.0)

    if risk_score > 0.15:
        macro_signal = "risk-on"
    elif risk_score < -0.15:
        macro_signal = "risk-off"
    else:
        macro_signal = "echilibrat"

    return risk_score, macro_signal


# ---------- orchestrare ----------

def main() -> None:
    log("Pornește build_global_coeziv_state.py")

    df_prices = load_all_series()

    ic_series = compute_ic_global_structural(df_prices)
    icd_series = compute_icd_global_directional(df_prices)

    # aliniem cele două serii pe intersecția comună
    common_index = ic_series.index.intersection(icd_series.index)
    ic_series = ic_series.loc[common_index]
    icd_series = icd_series.loc[common_index]

    if len(common_index) == 0:
        raise RuntimeError("Nu există intersecție de date între IC_GLOBAL și ICD_GLOBAL.")

    # construim seria pentru JSON
    records: List[Dict[str, float]] = []
    for ts in common_index:
        t_ms = int(ts.timestamp() * 1000)
        ic_val = float(ic_series.loc[ts])
        icd_val = float(icd_series.loc[ts])

        records.append(
            {
                "t": t_ms,
                "ic_global": round(ic_val, 2),
                "icd_global": round(icd_val, 2),
            }
        )

    if not records:
        raise RuntimeError("Nu am reușit să construiesc nicio observație pentru IC_GLOBAL/ICD_GLOBAL.")

    records = sorted(records, key=lambda x: x["t"])
    current = records[-1]

    ic_val = current["ic_global"]
    icd_val = current["icd_global"]

    # Regim + scor de risc
    regime_obj = classify_global_regime(ic_val, icd_val)
    risk_score, macro_signal = compute_risk_score_and_macro(ic_val, icd_val)

    current["regime"] = regime_obj.regime

    # praguri (folosite în front-end; păstrăm aceleași defaulturi)
    thresholds = {
        "ic_low": 40.0,
        "ic_high": 65.0,
        "icd_low": 40.0,
        "icd_high": 60.0,
    }

    as_of_date = datetime.fromtimestamp(current["t"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

    payload: Dict[str, object] = {
        # pentru BTC macro
        "as_of": as_of_date,
        "risk_score": round(risk_score, 4),
        "macro_signal": macro_signal,
        # pentru pagina ic_global.html
        "series": records,
        "current": current,
        "thresholds": thresholds,
        # metadate
        "meta": {
            "source": "coeziv-global-python",
            "window_struct_days": WINDOW_STRUCT,
            "window_dir_days": WINDOW_DIR,
            "description": (
                "Model coeziv global: IC_GLOBAL structural din corelații multi-asset, "
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
        f"ICD_GLOBAL={icd_val:.2f}, regim={regime_obj.regime}, "
        f"risk_score={risk_score:.3f}, macro_signal={macro_signal}"
    )


if __name__ == "__main__":
    main()
