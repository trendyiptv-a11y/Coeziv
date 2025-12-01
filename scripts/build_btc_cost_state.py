import math
import json
from datetime import datetime
from pathlib import Path

import pandas as pd


def estimate_btc_production_cost_usd(
    difficulty: float,
    block_subsidy_btc: float,
    fees_btc_per_block: float = 0.0,
    electricity_price_usd_per_kwh: float = 0.06,
    miner_efficiency_j_per_th: float = 25.0,
) -> float:
    """
    Estimează costul de producție pentru 1 BTC (USD), pe baza unui model simplificat:
    - difficulty -> câți hash-i trebuie pentru un block
    - miner_efficiency_j_per_th -> câtă energie consumă minerii moderni
    - electricity_price_usd_per_kwh -> preț energie
    - block_subsidy_btc + fees_btc_per_block -> câți BTC se obțin pe block
    """

    if difficulty <= 0 or block_subsidy_btc <= 0:
        return float("nan")

    # Hash-uri necesare pentru un block
    hashes_per_block = difficulty * (2 ** 32)

    # Eficiență: J pe TH -> J pe hash
    joules_per_hash = miner_efficiency_j_per_th / 1e12

    # Energie totală pentru un block
    energy_joules = hashes_per_block * joules_per_hash
    energy_kwh = energy_joules / 3_600_000.0

    # Cost energie
    cost_energy_usd = energy_kwh * electricity_price_usd_per_kwh

    # BTC per block (subsidy + fees)
    btc_per_block = block_subsidy_btc + max(fees_btc_per_block, 0.0)
    if btc_per_block <= 0:
        return float("nan")

    # Cost pe 1 BTC
    return float(cost_energy_usd / btc_per_block)


def current_block_subsidy(ts: datetime) -> float:
    """
    Returnează subsidy-ul de block (BTC) în funcție de dată.
    Poți ajusta datele halving-urilor dacă vrei mai multă precizie.
    """

    halvings = [
        (datetime(2009, 1, 3), 50.0),
        (datetime(2012, 11, 28), 25.0),
        (datetime(2016, 7, 9), 12.5),
        (datetime(2020, 5, 11), 6.25),
        (datetime(2024, 4, 20), 3.125),
        # future estimate
        (datetime(2028, 5, 1), 1.5625),
    ]

    for start, subsidy in reversed(halvings):
        if ts >= start:
            return subsidy

    # fallback pentru orice înainte de 2009 (teoretic nu e cazul)
    return 50.0


def build_cost_state(
    btc_daily_path: str = "data/btc_daily.csv",
    out_cost_state_path: str = "data/btc_cost_state.json",
) -> None:
    """
    Construiește fișierul data/btc_cost_state.json pe baza btc_daily.csv.
    Nu modifică btc_state_latest.json.
    """

    csv_path = Path(btc_daily_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"Nu găsesc fișierul {csv_path}")

    df = pd.read_csv(csv_path)

    if "date" not in df.columns or "close" not in df.columns:
        raise ValueError(
            "btc_daily.csv trebuie să conțină cel puțin coloanele 'date' și 'close'"
        )

    # Convertim și sortăm după dată
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")

    latest = df.iloc[-1]
    as_of = latest["date"]
    close = float(latest["close"])

    # difficulty (dacă există)
    if "difficulty" in df.columns:
        difficulty = float(latest["difficulty"])
    else:
        difficulty = float("nan")

    # taxe medii per block, dacă ai o coloană cu așa ceva
    if "avg_fees_per_block_btc" in df.columns:
        fees_btc = float(latest["avg_fees_per_block_btc"])
    else:
        fees_btc = 0.0

    # Subsidy în funcție de dată
    subsidy = current_block_subsidy(as_of.to_pydatetime())

    # Cost de producție estimat
    prod_cost = estimate_btc_production_cost_usd(
        difficulty=difficulty,
        block_subsidy_btc=subsidy,
        fees_btc_per_block=fees_btc,
        electricity_price_usd_per_kwh=0.06,  # poți schimba la nevoie
        miner_efficiency_j_per_th=25.0,      # miner modern (antminer S21 ~ 17–20 J/TH)
    )

    state = {
        "as_of": as_of.strftime("%Y-%m-%d"),
        "close": close,
        "difficulty": None if math.isnan(difficulty) else difficulty,
        "block_subsidy_btc": subsidy,
        "fees_btc_per_block": round(fees_btc, 8),
    }

    if math.isfinite(prod_cost) and prod_cost > 0:
        state["prod_cost_usd"] = round(prod_cost, 2)
        state["prod_margin"] = round(close / prod_cost, 2)
    else:
        state["prod_cost_usd"] = None
        state["prod_margin"] = None

    out_path = Path(out_cost_state_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    build_cost_state()
