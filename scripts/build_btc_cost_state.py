#!/usr/bin/env python3
"""
Construiește data/btc_cost_state.json plecând de la data/btc_daily.csv.

Modelul de cost este:
- fizic: difficulty -> hash-uri -> energie -> cost electric
- ancorat în timp: eficiență ASIC (J/TH) în funcție de an, inspirat din date Cambridge
- realistic: preț mediu energie ~0.05 USD/kWh
- complet: cost electric * 1.25 ≈ cost total de producție (capex + opex simplificat)

Rezultatul NU este o valoare contabilă exactă, ci o ancoră structurală
pentru ciclurile Bitcoin.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import requests


# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BTC_DAILY_CSV = DATA_DIR / "btc_daily.csv"
BTC_COST_STATE_JSON = DATA_DIR / "btc_cost_state.json"

# Preț mediu global al energiei pentru mineri (USD/kWh)
ELECTRICITY_USD_PER_KWH_BASE = 0.05

# Markup electric -> cost total (electric + capex + opex, aproximativ)
PRODUCTION_MARKUP = 1.25

# Timeout pentru requestul de difficulty live
HTTP_TIMEOUT = 10


# ---------------------------------------------------------
# MODEL COST DE PRODUCȚIE
# ---------------------------------------------------------

def get_live_difficulty() -> float:
    """
    Ia difficulty curentă din blockchain.info.
    Dacă nu reușește, întoarce NaN (nu aruncă excepție).
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


def efficiency_j_per_th_for_date(dt: datetime) -> float:
    """
    Eficiența medie a flotei (J/TH) în funcție de perioadă.

    Valorile sunt piecewise și aproximative, dar ancorate în evoluția reală:
    - înainte de ASIC (CPU/GPU) -> ineficiență enormă (doar istoric)
    - 2013+ -> ASIC-uri, apoi generații tot mai eficiente
    """
    if dt < datetime(2013, 1, 1):
        # CPU / GPU – pur istoric, nu contează mult pentru modelul actual
        return 5_000_000.0  # J/TH (practic inutil pentru prezent)

    if dt < datetime(2016, 1, 1):
        # primele ASIC-uri comerciale
        return 600.0

    if dt < datetime(2018, 1, 1):
        # generații mai bune de ASIC
        return 120.0

    if dt < datetime(2020, 1, 1):
        # eficiență în jur de 80 J/TH
        return 80.0

    if dt < datetime(2023, 1, 1):
        # 2020–2022 ~45 J/TH rețea
        return 45.0

    if dt < datetime(2024, 6, 1):
        # până în 2023 ~33 J/TH, apoi coboară spre 30
        return 33.0

    if dt < datetime(2025, 1, 1):
        # Cambridge iunie 2024 ~28.2 J/TH
        return 28.2

    # 2025+ proiecție conservatoare (rețea mai eficientă)
    return 26.0


def electricity_price_usd_per_kwh_for_date(dt: datetime) -> float:
    """
    Preț energie pentru mineri (USD/kWh).

    Poți rafina modelul (ex. perioade cu energie mai ieftină / scumpă),
    dar pentru stabilitate folosim o medie de 0.05 USD/kWh.
    """
    return ELECTRICITY_USD_PER_KWH_BASE


def estimate_cost_usd_per_btc(
    difficulty: float,
    block_subsidy_btc: float,
    when: datetime,
    fees_btc_per_block: float = 0.0,
    production_markup: float = PRODUCTION_MARKUP,
) -> Tuple[float, float]:
    """
    Returnează (electric_cost, full_production_cost) în USD/BTC.

    Pași:
      - difficulty -> hash-uri per block: D * 2^32
      - eficiență J/TH -> J/hash
      - energie -> kWh -> cost electric per block
      - împărțit la BTC/block (subsidy + fees) -> cost electric per BTC
      - multiplicat cu production_markup -> cost total de producție
    """
    if not (math.isfinite(difficulty) and difficulty > 0.0):
        return (float("nan"), float("nan"))
    if block_subsidy_btc <= 0.0:
        return (float("nan"), float("nan"))

    eff_j_per_th = efficiency_j_per_th_for_date(when)
    elec_price = electricity_price_usd_per_kwh_for_date(when)

    # 1. hash-uri per block
    hashes_per_block = difficulty * (2.0 ** 32)

    # 2. J per hash
    joules_per_hash = eff_j_per_th / 1e12  # J/TH -> J/hash

    # 3. energie per block
    energy_joules = hashes_per_block * joules_per_hash
    energy_kwh = energy_joules / 3_600_000.0  # 1 kWh = 3.6e6 J

    # 4. cost electric per block
    cost_block_electric = energy_kwh * elec_price

    # 5. BTC per block
    btc_per_block = block_subsidy_btc + max(fees_btc_per_block, 0.0)
    if btc_per_block <= 0.0:
        return (float("nan"), float("nan"))

    cost_electric_per_btc = cost_block_electric / btc_per_block
    cost_full_per_btc = cost_electric_per_btc * production_markup

    return float(cost_electric_per_btc), float(cost_full_per_btc)


# ---------------------------------------------------------
# STRUCTURĂ OUTPUT
# ---------------------------------------------------------

@dataclass
class BtcCostState:
    as_of: str
    close: Optional[float]

    difficulty: Optional[float]
    block_subsidy_btc: float
    fees_btc_per_block: float

    prod_cost_electric_usd: Optional[float]
    prod_cost_total_usd: Optional[float]
    prod_margin: Optional[float]  # close / full_cost (ex: 2.0 = 2x cost)

    method: str
    params: dict


# ---------------------------------------------------------
# PIPELINE
# ---------------------------------------------------------

def load_latest_row(csv_path: Path) -> pd.Series:
    if not csv_path.exists():
        raise FileNotFoundError(f"Nu găsesc fișierul {csv_path}")

    df = pd.read_csv(csv_path)

    # detectăm o coloană de dată
    date_col = None
    for cand in ("date", "Date", "time", "Time", "timestamp", "Timestamp"):
        if cand in df.columns:
            date_col = cand
            break

    if date_col is not None:
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col)

    latest = df.iloc[-1]
    return latest


def build_btc_cost_state() -> BtcCostState:
    latest = load_latest_row(BTC_DAILY_CSV)

    # --- as_of ---
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
    close = None
    for cand in ("close", "Close", "adj_close", "Adj Close", "AdjClose"):
        if cand in latest.index:
            try:
                close = float(latest[cand])
                break
            except Exception:
                pass

    # --- difficulty: CSV sau live ---
    difficulty = None
    if "difficulty" in latest.index:
        try:
            d_raw = float(latest["difficulty"])
        except Exception:
            d_raw = float("nan")

        if math.isfinite(d_raw) and d_raw > 0.0:
            difficulty = d_raw
        else:
            d_live = get_live_difficulty()
            if math.isfinite(d_live) and d_live > 0.0:
                difficulty = d_live
    else:
        d_live = get_live_difficulty()
        if math.isfinite(d_live) and d_live > 0.0:
            difficulty = d_live

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
    electric_cost = None
    full_cost = None
    if difficulty is not None:
        ce, cf = estimate_cost_usd_per_btc(
            difficulty=difficulty,
            block_subsidy_btc=block_subsidy,
            when=as_of_dt,
            fees_btc_per_block=fees_btc,
            production_markup=PRODUCTION_MARKUP,
        )
        if math.isfinite(ce) and ce > 0.0:
            electric_cost = ce
        if math.isfinite(cf) and cf > 0.0:
            full_cost = cf

    # --- marja vs cost total ---
    prod_margin = None
    if close is not None and full_cost is not None and full_cost > 0.0:
        prod_margin = close / full_cost

    return BtcCostState(
        as_of=as_of_str,
        close=close,
        difficulty=difficulty,
        block_subsidy_btc=block_subsidy,
        fees_btc_per_block=round(fees_btc, 8),
        prod_cost_electric_usd=None if electric_cost is None else round(electric_cost, 2),
        prod_cost_total_usd=None if full_cost is None else round(full_cost, 2),
        prod_margin=None if prod_margin is None else round(prod_margin, 2),
        method="difficulty_energy_model_v2",
        params={
            "electricity_usd_per_kwh_base": ELECTRICITY_USD_PER_KWH_BASE,
            "production_markup": PRODUCTION_MARKUP,
            "efficiency_model": "piecewise_time_dependent",
        },
    )


def main() -> None:
    state = build_btc_cost_state()
    BTC_COST_STATE_JSON.parent.mkdir(parents=True, exist_ok=True)
    with BTC_COST_STATE_JSON.open("w", encoding="utf-8") as f:
        json.dump(asdict(state), f, ensure_ascii=False, indent=2)

    print(f"[build_btc_cost_state] Scris {BTC_COST_STATE_JSON}")
    print(f"  as_of: {state.as_of}")
    if state.close is not None:
        print(f"  close: {state.close:,.2f} USD")
    if state.difficulty is not None:
        print(f"  difficulty: {state.difficulty:.0f}")
    if state.prod_cost_electric_usd is not None:
        print(f"  cost electric: {state.prod_cost_electric_usd:,.2f} USD/BTC")
    if state.prod_cost_total_usd is not None:
        print(f"  cost total: {state.prod_cost_total_usd:,.2f} USD/BTC")
    if state.prod_margin is not None:
        print(f"  marjă vs cost: {state.prod_margin:.2f}x")


if __name__ == "__main__":
    main()
