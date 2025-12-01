#!/usr/bin/env python3
"""
Script simplu pentru calculul costului de producție al Bitcoin
și generarea fișierului data/btc_cost_state.json pentru cardul din UI.

Nu folosește niciun API. Toate datele (hashrate, preț BTC etc.)
sunt introduse manual de utilizator.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import json


@dataclass
class BtcProdCostParams:
    efficiency_j_per_th: float = 25.0        # eficiența ASIC de referință (J/TH)
    energy_price_usd_per_kwh: float = 0.05   # preț energie (USD/kWh)
    blocks_per_day: float = 144.0            # ~144 blocuri/zi
    block_reward_btc: float = 3.125          # reward curent (după halving 2024)
    all_in_factor: float = 1.0               # 1.0 = doar energie; ex. 1.2 = +20% capex/opex


def btc_production_cost(hashrate_eh_per_s: float, params: BtcProdCostParams) -> dict:
    """
    Calculează costul de producție pe BTC, pe baza hashrate-ului rețelei
    și a parametrilor energetici/economici.
    """
    # 1) Conversii
    hashrate_h_per_s = hashrate_eh_per_s * 1e18           # EH/s -> H/s
    eta_j_per_hash = params.efficiency_j_per_th / 1e12    # J/TH -> J/hash

    # 2) Puterea totală a rețelei (W)
    power_w = hashrate_h_per_s * eta_j_per_hash

    # 3) Consum de energie / zi (kWh)
    energy_kwh_per_day = power_w * 24 / 1000.0

    # 4) BTC minați pe zi
    btc_per_day = params.blocks_per_day * params.block_reward_btc

    # 5) Energie per BTC
    energy_kwh_per_btc = energy_kwh_per_day / btc_per_day

    # 6) Cost energie per BTC
    cost_energy_per_btc = energy_kwh_per_btc * params.energy_price_usd_per_kwh

    # 7) Cost all-in (dacă alegi un factor > 1)
    cost_allin_per_btc = cost_energy_per_btc * params.all_in_factor

    return {
        "energy_kwh_per_day": energy_kwh_per_day,
        "btc_per_day": btc_per_day,
        "energy_kwh_per_btc": energy_kwh_per_btc,
        "cost_energy_usd_per_btc": cost_energy_per_btc,
        "cost_allin_usd_per_btc": cost_allin_per_btc,
    }


def ask_float(prompt: str, default: float) -> float:
    """
    Citește un float de la tastatură, cu valoare implicită dacă se apasă Enter.
    """
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    return float(raw.replace(",", "."))  # permite și virgulă


def main() -> None:
    print("=== BTC Production Cost – generator btc_cost_state.json ===\n")

    # 1) Parametri de model (poți schimba valorile implicite după preferințe)
    params = BtcProdCostParams()

    print("Parametri de model (poți accepta valorile implicite sau le poți schimba):")
    params.efficiency_j_per_th = ask_float(
        "Eficiență ASIC de referință (J/TH)", params.efficiency_j_per_th
    )
    params.energy_price_usd_per_kwh = ask_float(
        "Preț energie (USD/kWh)", params.energy_price_usd_per_kwh
    )
    params.blocks_per_day = ask_float(
        "Blocuri pe zi (de obicei 144)", params.blocks_per_day
    )
    params.block_reward_btc = ask_float(
        "Block reward (BTC/block)", params.block_reward_btc
    )
    params.all_in_factor = ask_float(
        "Factor all-in (1.0 = doar energie; ex. 1.2 = +20% capex/opex)",
        params.all_in_factor,
    )

    print("\nDate de piață pentru ziua curentă (introduse manual):")
    hashrate_eh_per_s = ask_float(
        "Hashrate rețea (EH/s, ex. 1065)", 1065.0
    )
    close_price_usd = ask_float(
        "Preț BTC (USD/BTC, close)", 85000.0
    )

    # 2) Calcul cost
    metrics = btc_production_cost(hashrate_eh_per_s, params)

    prod_cost_usd = metrics["cost_allin_usd_per_btc"]
    prod_margin = close_price_usd / prod_cost_usd if prod_cost_usd > 0 else None

    # 3) Construiește obiectul de stare pentru card
    state = {
        "as_of": date.today().isoformat(),         # ex. "2025-12-01"
        "close": round(close_price_usd, 2),
        "prod_cost_usd": round(prod_cost_usd, 2),
        "prod_margin": round(prod_margin, 4) if prod_margin is not None else None,
        # opțional: parametri, pentru transparență (UI poate să-i ignore)
        "params": {
            "hashrate_eh_per_s": hashrate_eh_per_s,
            "efficiency_j_per_th": params.efficiency_j_per_th,
            "energy_price_usd_per_kwh": params.energy_price_usd_per_kwh,
            "blocks_per_day": params.blocks_per_day,
            "block_reward_btc": params.block_reward_btc,
            "all_in_factor": params.all_in_factor,
        },
    }

    # 4) Scriere fișier JSON în ./data/btc_cost_state.json
    base_dir = Path(__file__).resolve().parent
    data_dir = base_dir / "data"
    data_dir.mkdir(exist_ok=True)

    out_path = data_dir / "btc_cost_state.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print("\n=== Rezultat ===")
    print(f"Cost producție (prod_cost_usd): {state['prod_cost_usd']} USD/BTC")
    print(f"Preț BTC (close):               {state['close']} USD/BTC")
    if state["prod_margin"] is not None:
        print(f"Raport preț / cost (prod_margin): {state['prod_margin']}")
    print(f"\nFișier generat: {out_path}")


if __name__ == "__main__":
    main()
