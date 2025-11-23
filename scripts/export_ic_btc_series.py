import json
import math
from pathlib import Path
from datetime import datetime, timedelta

import pandas as pd

# ---------------- CONFIG ----------------

ROOT = Path(__file__).resolve().parents[1]  # rădăcina repo-ului
BTC_OHLC_PATH = ROOT / "btc_ohlc.json"      # fișierul tău existent
OUT_PATH = ROOT / "data" / "ic_btc_series.json"

WINDOW_DAYS = 260  # fereastra internă a modelului coeziv

# IMPORTANT:
# Aici trebuie să legi de modelul tău oficial.
# Ideea este: pentru un DataFrame "window_df" (ultimele N zile),
# să obții un dict cu:
#   ic_struct, ic_dir, ic_flux, ic_cycle, regime
#
# Dacă AI DEJA un script gen update_btc_state_latest_from_daily.py
# cu o funcție care calculează aceste valori, import-o și folosește-o aici.
#
# Mai jos pun un exemplu de stub – trebuie înlocuit cu apelul real la model.


def compute_coeziv_state_for_window(window_df: pd.DataFrame) -> dict:
    """
    TODO: LEAGĂ AICI MODELUL TĂU REAL.

    window_df: DataFrame cu coloane (open, high, low, close, volume) și index datetime.
    Returnează un dict:
      {
        "ic_struct": float,
        "ic_dir": float,
        "ic_flux": float,
        "ic_cycle": float,
        "regime": "bull_early" | "bull_late" | "bear" | "base" | "neutral" | etc
      }
    """

    # EXEMPLU “FAKE” – DOAR CA SĂ NU CRAPE SCRIPTUL
    # Înlocuiește complet cu apel la modelul tău Python!
    close = window_df["close"]
    ret = close.pct_change().fillna(0)

    vol_30 = ret.rolling(30).std().iloc[-1] * math.sqrt(365) * 100 if len(ret) >= 30 else 0
    trend_50 = close.ewm(span=50, adjust=False).mean().iloc[-1]
    trend_200 = close.ewm(span=200, adjust=False).mean().iloc[-1]

    trend_diff = (trend_50 - trend_200) / max(trend_200, 1e-8)

    # aici doar un placeholder, ca pattern de ieșire:
    ic_struct = max(0, min(100, 50 + (abs(trend_diff) * 400 - vol_30 * 0.4)))
    ic_dir = max(0, min(100, 50 + trend_diff * 400))
    ic_flux = max(0, min(100, 100 - vol_30))
    ic_cycle = 50.0

    if ic_struct > 60 and ic_dir > 55:
        regime = "bull"
    elif ic_struct < 35 and ic_dir < 45:
        regime = "bear"
    else:
        regime = "neutral"

    return {
        "ic_struct": float(ic_struct),
        "ic_dir": float(ic_dir),
        "ic_flux": float(ic_flux),
        "ic_cycle": float(ic_cycle),
        "regime": regime,
    }


def main():
    if not BTC_OHLC_PATH.exists():
        raise FileNotFoundError(f"Nu găsesc {BTC_OHLC_PATH}")

    with BTC_OHLC_PATH.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, list):
        raise ValueError("btc_ohlc.json trebuie să fie o listă de obiecte.")

    df = pd.DataFrame(raw)

    # Determinăm coloana de timp
    time_col = None
    for cand in ["timestamp", "time", "t", "date"]:
        if cand in df.columns:
            time_col = cand
            break
    if time_col is None:
        raise ValueError("Nu am găsit coloană de timp în btc_ohlc.json")

    # Convertim la datetime
    # Presupunem ms dacă e număr > 10^11, altfel secunde sau string ISO
    if pd.api.types.is_numeric_dtype(df[time_col]):
        sample = float(df[time_col].iloc[0])
        if sample > 10_000_000_000:  # probabil ms
            df["t"] = pd.to_datetime(df[time_col], unit="ms", utc=True)
        else:
            df["t"] = pd.to_datetime(df[time_col], unit="s", utc=True)
    else:
        df["t"] = pd.to_datetime(df[time_col], utc=True)

    df = df.sort_values("t").set_index("t")

    # Ne asigurăm că avem coloanele de preț
    for col in ["open", "high", "low", "close"]:
        if col not in df.columns:
            raise ValueError(f"Lipsește coloana '{col}' din btc_ohlc.json")

    records = []
    min_window = int(WINDOW_DAYS * 0.6)  # nu calculăm nimic pe ferestre prea scurte

    for current_ts in df.index:
        start_ts = current_ts - timedelta(days=WINDOW_DAYS - 1)
        window_df = df.loc[start_ts:current_ts]
        if len(window_df) < min_window:
            continue

        state = compute_coeziv_state_for_window(window_df)

        rec = {
            "t": int(current_ts.timestamp() * 1000),  # ms
            "close": float(window_df["close"].iloc[-1]),
            "ic_struct": float(state["ic_struct"]),
            "ic_dir": float(state["ic_dir"]),
            "ic_flux": float(state["ic_flux"]),
            "ic_cycle": float(state["ic_cycle"]),
            "regime": state.get("regime", "neutral"),
        }
        records.append(rec)

    if not records:
        raise RuntimeError("Nu am reușit să calculez nicio fereastră IC_BTC.")

    meta = {
        "as_of": datetime.utcfromtimestamp(records[-1]["t"] / 1000).strftime("%Y-%m-%d"),
        "window_days": WINDOW_DAYS,
        "source": "coeziv-btc-python",
        "note": "Seria IC_BTC/ICD_BTC/flux/ciclu calculată în Python din btc_ohlc.json.",
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump({"meta": meta, "series": records}, f, ensure_ascii=False, indent=2)

    print(f"Scris {len(records)} puncte în {OUT_PATH}")


if __name__ == "__main__":
    main()
