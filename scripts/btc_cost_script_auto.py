#!/usr/bin/env python3
"""
btc_cost_script_auto.py

Calculează costul de producție al BTC și generează fișierul
data/btc_cost_state.json pentru card, fără input interactiv.

Valorile pot fi setate:
- prin variabile de mediu (HASHRATE_EH_PER_S, PRICE_USD etc.)
- sau prin valorile implicite de mai jos.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import json
import os


@dataclass
class BtcProdCostParams:
    efficiency_j_per_th: float = 25.0        # eficiență ASIC (J/TH)
    energy_price_usd_per_kwh: float = 0.05   # preț energie (USD/kWh)
    blocks_per_day: float = 144.0            # ~144 blocuri/zi
    block_reward_btc: float = 3.125          # reward curent (post–halving 2024)
    all_in_factor: float = 1.0               # 1.0 = doar energie; ex. 1.2 = +20% capex/opex


def env_float(key: str, default: float) -> float:
    raw = os.getenv(key)
    if not raw:
        return default
    try:
        return float(str(raw).replace(",", "."))
    except ValueError:
        return default


def btc_production_cost(hashrate_eh_per_s: float, params: BtcProdCostParams) -> dict:
    hashrate_h_per_s = hashrate_eh_per_s * 1e18           # EH/s -> H/s
    eta_j_per_hash = params.efficiency_j_per_th / 1e12    # J/TH -> J/hash

    power_w = hashrate_h_per_s * eta_j_per_hash           # putere rețea (W)
    energy_kwh_per_day = power_w * 24 / 1000.0            # kWh/zi

    btc_per_day = params.blocks_per_day * params.block_reward_btc
    energy_kwh_per_btc = energy_kwh_per_day / btc_per_day

    cost_energy_per_btc = energy_kwh_per_btc * params.energy_price_usd_per_kwh
    cost_allin_per_btc = cost_energy_per_btc * params.all_in_factor

    return {
        "energy_kwh_per_day": energy_kwh_per_day,
        "btc_per_day": btc_per_day,
        "energy_kwh_per_btc": energy_kwh_per_btc,
        "cost_energy_usd_per_btc": cost_energy_per_btc,
        "cost_allin_usd_per_btc": cost_allin_per_btc,
    }


def main() -> None:
    # 1) Citește valorile din env sau folosește default
    hashrate_eh_per_s = env_float("HASHRATE_EH_PER_S", 1065.0)
    close_price_usd = env_float("PRICE_USD", 85000.0)

    params = BtcProdCostParams(
        efficiency_j_per_th=env_float("EFFICIENCY_J_PER_TH", 25.0),
        energy_price_usd_per_kwh=env_float("ENERGY_PRICE_USD_PER_KWH", 0.05),
        blocks_per_day=env_float("BLOCKS_PER_DAY", 144.0),
        block_reward_btc=env_float("BLOCK_REWARD_BTC", 3.125),
        all_in_factor=env_float("ALL_IN_FACTOR", 1.0),
    )

    metrics = btc_production_cost(hashrate_eh_per_s, params)
    prod_cost_usd = metrics["cost_allin_usd_per_btc"]
    prod_margin = close_price_usd / prod_cost_usd if prod_cost_usd > 0 else None

    state = {
        "as_of": date.today().isoformat(),
        "close": round(close_price_usd, 2),
        "prod_cost_usd": round(prod_cost_usd, 2),
        "prod_margin": round(prod_margin, 4) if prod_margin is not None else None,
        "params": {
            "hashrate_eh_per_s": hashrate_eh_per_s,
            "efficiency_j_per_th": params.efficiency_j_per_th,
            "energy_price_usd_per_kwh": params.energy_price_usd_per_kwh,
            "blocks_per_day": params.blocks_per_day,
            "block_reward_btc": params.block_reward_btc,
            "all_in_factor": params.all_in_factor,
        },
    }

    base_dir = Path(__file__).resolve().parent
    data_dir = base_dir / "data"
    data_dir.mkdir(exist_ok=True)

    out_path = data_dir / "btc_cost_state.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print(f"[btc_cost_script_auto] Scris {out_path} cu prod_cost_usd={state['prod_cost_usd']} USD/BTC")


if __name__ == "__main__":
    main()
