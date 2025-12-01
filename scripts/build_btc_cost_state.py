#!/usr/bin/env python3
"""
Actualizează data/btc_state_latest.json plecând de la data/btc_daily.csv
și adaugă un cost estimat de producție al Bitcoin (USD / BTC).

Logică:
- ia ultimul close din btc_daily.csv
- ia difficulty:
    * din CSV, dacă există coloana `difficulty` și valoarea este validă
    * altfel, o ia live din https://blockchain.info/q/getdifficulty
- estimează costul de producție pe baza unui model energetic simplu
- calculează marja față de cost (close / cost - 1)
- actualizează btc_state_latest.json (lăsând restul câmpurilor cum erau)
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, asdict
from datetime import datetime

import pandas as pd
import requests


# ==========================
# CONFIG – modificabile ușor
# ==========================

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DAILY_CSV = os.path.join(DATA_DIR, "btc_daily.csv")
STATE_JSON = os.path.join(DATA_DIR, "btc_state_latest.json")

# Parametrii modelului energetic (valori rezonabile, dar configurabile)
EFFICENCY_J_PER_TH = 30.0  # J / TH (ASIC modern; ex: 25–35 J/TH)
ELECTRICITY_USD_PER_KWH = 0.06  # preț energie (USD / kWh)

# Timeout pentru request-ul de difficulty
HTTP_TIMEOUT = 10


@dataclass
class ProductionCost:
    difficulty: float | None
    block_reward: float | None
    cost_usd_per_btc: float | None
    margin_pct: float | None  # (close / cost - 1) * 100
    method: str
    params: dict


# ==============
# Helper functions
# ==============

def load_latest_row(csv_path: str) -> pd.Series:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Nu găsesc fișierul CSV: {csv_path}")

    df = pd.read_csv(csv_path)

    # presupunem coloane: date / time sau similar + close
    date_col_candidates = [c for c in df.columns if c.lower() in ("date", "time", "timestamp")]
    if not date_col_candidates:
        # fallback: folosim indexul ca ordine
        latest = df.iloc[-1]
    else:
        date_col = date_col_candidates[0]
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col)
        latest = df.iloc[-1]

    return latest


def get_live_difficulty() -> float | float("nan"):
    """
    Ia difficulty curentă din blockchain.info.
    Dacă nu reușește, întoarce NaN (nu aruncă excepție).
    """
    url = "https://blockchain.info/q/getdifficulty"
    try:
        resp = requests.get(url, timeout=HTTP_TIMEOUT)
        if resp.status_code == 200:
            return float(resp.text.strip())
    except Exception:
        pass
    return float("nan")


def get_block_reward(date: datetime) -> float:
    """
    Block reward aproximativ, pe baza datelor istorice de halving.
    E suficient pentru costul de producție al zilei curente.
    """
    # date de halving aproximative (UTC)
    # 2012-11-28 -> 25 BTC
    # 2016-07-09 -> 12.5 BTC
    # 2020-05-11 -> 6.25 BTC
    # 2024-04-20 -> 3.125 BTC
    # (următorul nu e încă necesar pentru prezent)
    if date < datetime(2012, 11, 28):
        return 50.0
    elif date < datetime(2016, 7, 9):
        return 25.0
    elif date < datetime(2020, 5, 11):
        return 12.5
    elif date < datetime(2024, 4, 20):
        return 6.25
    else:
        return 3.125


def estimate_cost_from_difficulty(
    difficulty: float,
    block_reward: float,
    eff_j_per_th: float = EFFICENCY_J_PER_TH,
    price_per_kwh: float = ELECTRICITY_USD_PER_KWH,
) -> float:
    """
    Heuristică simplă pentru costul de producție (USD / BTC).

    Pași:
    - difficulty -> număr de hash-uri per bloc: D * 2^32
    - plăcile au eficiență eff_j_per_th (J / TH)
    - convertim la J / hash, apoi cost per hash, apoi cost per bloc
    - împărțim la block_reward => cost per BTC
    """
    if not math.isfinite(difficulty) or difficulty <= 0 or block_reward <= 0:
        return float("nan")

    # 1 TH = 1e12 hash-uri
    j_per_hash = eff_j_per_th / 1e12  # J / hash
    hashes_per_block = difficulty * 2 ** 32  # formula standard
    energy_per_block_j = hashes_per_block * j_per_hash

    # 1 kWh = 3.6e6 J
    kwh_per_block = energy_per_block_j / 3.6e6
    cost_per_block = kwh_per_block * price_per_kwh

    cost_per_btc = cost_per_block / block_reward
    return float(cost_per_btc)


def build_production_cost(latest: pd.Series) -> ProductionCost:
    # extragem data close-ului
    # încercăm să detectăm coloana de dată din nou
    date_value = None
    for key in ("date", "time", "timestamp", "Date", "Time", "Timestamp"):
        if key in latest.index:
            try:
                date_value = pd.to_datetime(latest[key])
                break
            except Exception:
                pass

    if date_value is None:
        # fallback: folosim azi
        date_value = datetime.utcnow()

    # difficulty: CSV sau live
    difficulty: float
    if "difficulty" in latest.index:
        raw = latest["difficulty"]
        try:
            raw_f = float(raw)
        except Exception:
            raw_f = float("nan")

        if math.isfinite(raw_f) and raw_f > 0:
            difficulty = raw_f
        else:
            difficulty = get_live_difficulty()
    else:
        difficulty = get_live_difficulty()

    # block reward
    reward = get_block_reward(date_value)

    # cost
    if math.isfinite(difficulty):
        cost_usd = estimate_cost_from_difficulty(difficulty, reward)
    else:
        cost_usd = float("nan")

    # close price
    close = None
    for key in ("close", "Close", "adj_close", "Adj Close"):
        if key in latest.index:
            try:
                close = float(latest[key])
                break
            except Exception:
                pass

    margin_pct = None
    if close is not None and cost_usd and math.isfinite(cost_usd) and cost_usd > 0:
        margin_pct = (close / cost_usd - 1.0) * 100.0

    return ProductionCost(
        difficulty=difficulty if math.isfinite(difficulty) else None,
        block_reward=reward,
        cost_usd_per_btc=cost_usd if (cost_usd and math.isfinite(cost_usd)) else None,
        margin_pct=margin_pct if (margin_pct is not None and math.isfinite(margin_pct)) else None,
        method="difficulty_energy_model_v1",
        params={
            "efficiency_j_per_th": EFFICENCY_J_PER_TH,
            "electricity_usd_per_kwh": ELECTRICITY_USD_PER_KWH,
        },
    )


def load_existing_state(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # dacă e corupt, pornim de la zero
        return {}


def save_state(path: str, state: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)


def main() -> None:
    latest = load_latest_row(DAILY_CSV)
    prod = build_production_cost(latest)

    # Data pentru as_of
    as_of = None
    for key in ("date", "time", "timestamp", "Date", "Time", "Timestamp"):
        if key in latest.index:
            try:
                as_of = pd.to_datetime(latest[key]).strftime("%Y-%m-%d")
                break
            except Exception:
                pass
    if as_of is None:
        as_of = datetime.utcnow().strftime("%Y-%m-%d")

    # close
    close = None
    for key in ("close", "Close", "adj_close", "Adj Close"):
        if key in latest.index:
            try:
                close = float(latest[key])
                break
            except Exception:
                pass

    state = load_existing_state(STATE_JSON)

    # actualizăm doar câmpurile de preț + cost
    state["as_of"] = as_of
    if close is not None:
        state["close"] = close

    prod_dict = asdict(prod)
    # includem totul sub un nod dedicat
    state["production_cost"] = {
        "difficulty": prod_dict["difficulty"],
        "block_reward": prod_dict["block_reward"],
        "cost_usd_per_btc": prod_dict["cost_usd_per_btc"],
        "margin_pct_vs_price": prod_dict["margin_pct"],
        "method": prod_dict["method"],
        "params": prod_dict["params"],
    }

    save_state(STATE_JSON, state)
    print(f"[update_btc_state_latest_from_daily] Actualizat {STATE_JSON}")
    if prod.cost_usd_per_btc:
        print(f"  Cost estimat: {prod.cost_usd_per_btc:,.2f} USD/BTC")
    if prod.margin_pct is not None:
        print(f"  Marjă vs close: {prod.margin_pct:,.2f}%")
    if prod.difficulty:
        print(f"  Difficulty folosit: {prod.difficulty:,.0f}")
    print("Gata.")


if __name__ == "__main__":
    main()
