#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
export_ic_btc_series.py

Seria istorică oficială IC_BTC, sincronizată 1:1 cu modelul Python
din update_btc_state_latest_from_daily.py.

Ce face:
- citește data/btc_daily.csv (același input ca snapshot-ul live)
- pentru fiecare zi cu cel puțin ~260 de zile în urmă:
    - cheamă compute_state_from_prices(...) pe tot istoricul până în acea zi
    - calculează IC_BTC structural & direcțional exact ca snapshot-ul
    - derivă un indice de flux (ICF_BTC) și un indice de ciclu (ICC_BTC)
    - clasifică regimul coeziv cu classify_regime(...)
- scrie rezultatul în data/ic_btc_series.json:

{
  "meta": {...},
  "series": [
    {
      "t": <timestamp_ms>,
      "close": <float>,
      "ic_struct": <0-100>,
      "ic_dir": <0-100>,
      "ic_flux": <0-100>,
      "ic_cycle": <0-100>,
      "regime": "<code>",
      "regime_label": "<label>"
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime

# importăm modelul oficial
from update_btc_state_latest_from_daily import (
    read_btc_daily,
    compute_state_from_prices,
    classify_regime,
)

# ---------- config ----------

ROOT = Path(__file__).resolve().parent.parent
DATA_BTC = ROOT / "data"
INPUT_DAILY = DATA_BTC / "btc_daily.csv"
OUT_PATH = DATA_BTC / "ic_btc_series.json"

# fereastra minimă cerută de model (~260 zile)
MIN_WINDOW_DAYS = 260


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def compute_flux_and_cycle(
    ic_struct: float, ic_dir: float, vol30_index: float
) -> Tuple[float, float]:
    """
    Model conceptual pentru:
      - ICF_BTC (flux)
      - ICC_BTC (ciclu)

    Nu introduce date empirice noi, doar combină:
    - structura (IC_BTC structural)
    - direcționalitatea (ICD_BTC)
    - volatilitatea (vol30_index din modelul oficial)
    """

    # 1) Intensitatea direcției față de neutru (50)
    dir_strength = abs(ic_dir - 50.0)  # 0..50
    dir_strength_pct = clamp(dir_strength * 2.0, 0.0, 100.0)  # 0..100

    # 2) Fluxul: combinație între direcție și volatilitate
    #    - dacă direcția e clară și volat, fluxul e mare
    #    - dacă direcția e difuză și vol mică, fluxul e mic
    ic_flux = clamp(0.6 * dir_strength_pct + 0.4 * vol30_index, 0.0, 100.0)

    # 3) Ciclu: poziție de fază în raport cu:
    #    - structură (baza vs maturitate)
    #    - direcție (bear vs bull)
    #    - flux (accelerare vs liniștire)
    struct_c = ic_struct - 50.0
    dir_c = ic_dir - 50.0
    flux_c = ic_flux - 50.0

    phase_raw = 0.5 * struct_c + 0.2 * dir_c + 0.3 * flux_c
    ic_cycle = clamp(50.0 + phase_raw, 0.0, 100.0)

    return ic_flux, ic_cycle


def main() -> None:
    # 1) citim exact același input ca snapshot-ul live
    dates, closes = read_btc_daily(INPUT_DAILY)

    if len(dates) < MIN_WINDOW_DAYS:
        raise RuntimeError(
            f"Prea puține puncte în {INPUT_DAILY} "
            f"({len(dates)} < {MIN_WINDOW_DAYS}) pentru seria IC_BTC."
        )

    records: List[Dict] = []

    # 2) reconstituim "timeline-ul" modelului:
    #    pentru fiecare zi i, calculăm starea așa cum ar fi văzut-o
    #    modelul având la dispoziție doar datele până în ziua i.
    for i in range(len(dates)):
        window_len = i + 1
        if window_len < MIN_WINDOW_DAYS:
            continue  # încă nu avem destule date pentru model

        window_dates = dates[: window_len]
        window_closes = closes[: window_len]

        # calcule oficiale (aceleași ca snapshot-ul)
        metrics = compute_state_from_prices(window_dates, window_closes)
        ic_struct = float(metrics["ic_struct"])
        ic_dir = float(metrics["ic_dir"])
        vol30_index = float(metrics["vol30_index"])

        ic_flux, ic_cycle = compute_flux_and_cycle(
            ic_struct=ic_struct,
            ic_dir=ic_dir,
            vol30_index=vol30_index,
        )

        regime = classify_regime(ic_struct, ic_dir)

        ts = window_dates[-1]
        close = window_closes[-1]

        rec = {
            "t": int(ts.timestamp() * 1000),
            "close": float(close),
            "ic_struct": ic_struct,
            "ic_dir": ic_dir,
            "ic_flux": ic_flux,
            "ic_cycle": ic_cycle,
            "regime": regime.code,
            "regime_label": regime.label,
        }
        records.append(rec)

    if not records:
        raise RuntimeError("Nu am reușit să calculez nicio stare pentru seria IC_BTC.")

    meta = {
        "as_of": dates[-1].date().isoformat(),
        "points": len(records),
        "min_window_days": MIN_WINDOW_DAYS,
        "source": "coeziv-btc-official-python",
        "note": (
            "Seria IC_BTC/ICD_BTC/flux/ciclu calculată cu modelul oficial "
            "compute_state_from_prices + classify_regime, pe ferestre rulante "
            "de minim 260 zile din data/btc_daily.csv."
        ),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump({"meta": meta, "series": records}, f, ensure_ascii=False, indent=2)

    print(f"[Coeziv] Am scris {len(records)} puncte în {OUT_PATH}")


if __name__ == "__main__":
    main()
