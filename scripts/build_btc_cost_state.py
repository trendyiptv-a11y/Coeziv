#!/usr/bin/env python3
"""
Construiește data/btc_cost_state.json plecând de la data/btc_daily.csv.

- ia ultimul rând din btc_daily.csv
- extrage:
    - data (as_of)
    - prețul de închidere (close)
    - difficulty:
        * din CSV, dacă există și este validă
        * altfel, o ia live din https://blockchain.info/q/getdifficulty
    - eventuale taxe medii per block (dacă există o coloană avg_fees_per_block_btc)
- determină block reward-ul corect în funcție de data calendaristică
- estimează costul de producție (USD / BTC) folosind un model energetic simplu
- calculează marja față de cost: close / cost
- scrie rezultatul în data/btc_cost_state.json

Nu modifică btc_state_latest.json.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import requests


# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BTC_DAILY_CSV = DATA_DIR / "btc_daily.csv"
BTC_COST_STATE_JSON = DATA_DIR / "btc_cost_state.json"

# Parametrii modelului energetic
ELECTRICITY_USD_PER_KWH = 0.06   # preț mediu global de referință
EFFICIENCY_J_PER_TH = 30.0       # J/TH (ASIC modern ~ 25–35 J/TH)

HTTP_TIMEOUT = 10                # secunde pentru requestul de difficulty


# ---------------------------------------------------------
# MODEL COST DE PRODUCȚIE
# ---------------------------------------------------------

def get_live_difficulty() -> float:
    """
    Ia difficulty curentă din blockchain.info.
    Dacă nu reușește, întoarce NaN.
    """
    url = "https://blockchain.info/q/getdifficulty"
    try:
        r = requests.get(url, timeout=HTTP_TIMEOUT)
        if r.status_code == 200:
            return float(r.text.strip())
    except Exception:
        pass
    return float("nan")


def get_block_subsidy(dt: datetime) -> float:
    """
    Block subsidy (BTC / block) în funcție de dată.
    Halving-urile sunt aproximative, dar suficiente pentru model.
    """
    # date de halving (aprox. UTC):
    # 2009-01-03 - 2012-11-28: 50 BTC
    # 2012-11-28 - 2016-07-09: 25 BTC
    # 2016-07-09 - 2020-05-11: 12.5 BTC
    # 2020-05-11 - 2024-04-20: 6.25 BTC
    # după 2024-04-20: 3.125 BTC
    if dt < datetime(2012, 11, 28):
        return 50.0
    elif dt < datetime(2016, 7, 9):
        return 25.0
    elif dt < datetime(2020, 5, 11):
        return 12.5
    elif dt < datetime(2024, 4, 20):
        return 6.25
    else:
        return 3.125


def estimate_cost_usd_per_btc(
    difficulty: float,
    block_subsidy_btc: float,
    fees_btc_per_block: float = 0.0,
    efficiency_j_per_th: float = EFFICIENCY_J_PER_TH,
    electricity_usd_per_kwh: float = ELECTRICITY_USD_PER_KWH,
) -> float:
    """
    Estimează costul de producție pentru 1 BTC (USD), pornind de la:

    - difficulty -> număr de hash-uri per block: D * 2^32
    - efficiency_j_per_th -> J / TH pentru flota medie de mineri
    - electricity_usd_per_kwh -> costul energiei
    - block_subsidy_btc + fees_btc_per_block -> câți BTC se obțin / block

    Formula:

      hashes_per_block = difficulty * 2^32
      J/hash = efficiency_j_per_th / 1e12
      kWh/block = (hashes_per_block * J/hash) / 3.6e6
      cost_block = kWh/block * electricity
      cost_btc = cost_block / (subsidy + fees)
    """
    if not (math.isfinite(difficulty) and difficulty > 0):
        return float("nan")
    if block_subsidy_btc <= 0:
        return float("nan")

    # 1. Hash-uri per block
    hashes_per_block = difficulty * (2 ** 32)

    # 2. Jouli per hash
    joules_per_hash = efficiency_j_per_th / 1e12  # J/TH -> J/hash

    # 3. Energie per block
    energy_joules = hashes_per_block * joules_per_hash
    energy_kwh = energy_joules / 3_600_000.0  # 1 kWh = 3.6e6 J

    # 4. Cost per block
    cost_block_usd = energy_kwh * electricity_usd_per_kwh

    # 5. BTC per block
    btc_per_block = block_subsidy_btc + max(fees_btc_per_block, 0.0)
    if btc_per_block <= 0:
        return float("nan")

    cost_per_btc = cost_block_usd / btc_per_block
    return float(cost_per_btc)


@dataclass
class BtcCostState:
    as_of: str
    close: Optional[float]

    difficulty: Optional[float]
    block_subsidy_btc: float
    fees_btc_per_block: float

    prod_cost_usd: Optional[float]
    prod_margin: Optional[float]  # close / cost (ex: 2.0 = 2x cost)

    method: str
    params: dict


# ---------------------------------------------------------
# PIPELINE
# ---------------------------------------------------------

def load_latest_row(csv_path: Path) -> pd.Series:
    if not csv_path.exists():
        raise FileNotFoundError(f"Nu găsesc fișierul {csv_path}")

    df = pd.read_csv(csv_path)

    # detectăm coloana de dată
    date_col = None
    for cand in ("date", "Date", "time", "Time", "timestamp", "Timestamp"):
        if cand in df.columns:
            date_col = cand
            break

    if date_col is not None:
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col)
    # dacă nu există coloană de dată, păstrăm ordinea

    latest = df.iloc[-1]
    return latest


def build_btc_cost_state() -> BtcCostState:
    latest = load_latest_row(BTC_DAILY_CSV)

    # --- as_of ---
    as_of_dt: datetime
    as_of_str: str
    as_of_dt = datetime.utcnow()
    for cand in ("date", "Date", "time", "Time", "timestamp", "Timestamp"):
        if cand in latest.index:
            try:
                as_of_dt = pd.to_datetime(latest[cand]).to_pydatetime()
                break
            except Exception:
                pass
    as_of_str = as_of_dt.strftime("%Y-%m-%d")

    # --- close ---
    close: Optional[float] = None
    for cand in ("close", "Close", "adj_close", "Adj Close", "AdjClose"):
        if cand in latest.index:
            try:
                close = float(latest[cand])
                break
            except Exception:
                pass

    # --- difficulty: CSV -> altfel live ---
    difficulty: Optional[float]
    if "difficulty" in latest.index:
        try:
            d_raw = float(latest["difficulty"])
        except Exception:
            d_raw = float("nan")

        if math.isfinite(d_raw) and d_raw > 0:
            difficulty = d_raw
        else:
            difficulty_live = get_live_difficulty()
            difficulty = difficulty_live if math.isfinite(difficulty_live) else None
    else:
        difficulty_live = get_live_difficulty()
        difficulty = difficulty_live if math.isfinite(difficulty_live) else None

    # --- fees per block (opțional) ---
    fees_btc = 0.0
    if "avg_fees_per_block_btc" in latest.index:
        try:
            fees_btc = float(latest["avg_fees_per_block_btc"])
        except Exception:
            fees_btc = 0.0

    # --- block subsidy ---
    block_subsidy = get_block_subsidy(as_of_dt)

    # --- cost de producție ---
    if difficulty is not None:
        prod_cost = estimate_cost_usd_per_btc(
            difficulty=difficulty,
            block_subsidy_btc=block_subsidy,
            fees_btc_per_block=fees_btc,
            efficiency_j_per_th=EFFICIENCY_J_PER_TH,
            electricity_usd_per_kwh=ELECTRICITY_USD_PER_KWH,
        )
        if not (math.isfinite(prod_cost) and prod_cost > 0):
            prod_cost = None
    else:
        prod_cost = None

    # --- marja vs cost (multiplu) ---
    prod_margin: Optional[float] = None
    if close is not None and prod_cost is not None and prod_cost > 0:
        prod_margin = close / prod_cost

    return BtcCostState(
        as_of=as_of_str,
        close=close,
        difficulty=difficulty,
        block_subsidy_btc=block_subsidy,
        fees_btc_per_block=round(fees_btc, 8),
        prod_cost_usd=None if prod_cost is None else round(prod_cost, 2),
        prod_margin=None if prod_margin is None else round(prod_margin, 2),
        method="difficulty_energy_model_v1",
        params={
            "electricity_usd_per_kwh": ELECTRICITY_USD_PER_KWH,
            "efficiency_j_per_th": EFFICIENCY_J_PER_TH,
        },
    )


def main() -> None:
    state = build_btc_cost_state()
    BTC_COST_STATE_JSON.parent.mkdir(parents=True, exist_ok=True)
    with BTC_COST_STATE_JSON.open("w", encoding="utf-8") as f:
        json.dump(asdict(state), f, ensure_ascii=False, indent=2)
    print(f"[build_btc_cost_state] Scris {BTC_COST_STATE_JSON}")
    if state.prod_cost_usd is not None:
        print(f"  Cost estimat: {state.prod_cost_usd:,.2f} USD/BTC")
    if state.prod_margin is not None:
        print(f"  Marjă: {state.prod_margin:.2f}x cost")
    if state.difficulty is not None:
        print(f"  Difficulty folosită: {state.difficulty:.0f}")


if __name__ == "__main__":
    main()
