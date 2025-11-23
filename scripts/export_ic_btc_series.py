import json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd

from update_btc_state_latest_from_daily import classify_regime

ROOT = Path(__file__).resolve().parents[1]
BTC_OHLC_PATH = ROOT / "btc_ohlc.json"
OUT_PATH = ROOT / "data" / "ic_btc_series.json"


def percentile_rank_vector(hist: np.ndarray, current: np.ndarray) -> np.ndarray:
    """
    Vectorized percentile rank similar cu logica oficială.
    """
    ranks = np.searchsorted(np.sort(hist), current, side="right")
    return (ranks / len(hist)) * 100.0


def main():
    with BTC_OHLC_PATH.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    df = pd.DataFrame(raw)

    # Detect time col
    time_col = None
    for c in ["timestamp", "time", "t", "date"]:
        if c in df.columns:
            time_col = c
            break
    if not time_col:
        raise ValueError("Nu am găsit coloană timp")

    # Parse datetime
    if pd.api.types.is_numeric_dtype(df[time_col]):
        sample = float(df[time_col].iloc[0])
        unit = "ms" if sample > 10_000_000_000 else "s"
        df["t"] = pd.to_datetime(df[time_col], unit=unit, utc=True)
    else:
        df["t"] = pd.to_datetime(df[time_col], utc=True)

    df = df.sort_values("t").set_index("t")

    close = df["close"].astype(float)
    logret = np.log(close / close.shift(1))

    # --- Vectorized indicators (identic conceptual cu modelul oficial) ---

    ema50 = close.ewm(span=50, adjust=False).mean()
    ema200 = close.ewm(span=200, adjust=False).mean()

    spread = (ema50 - ema200).abs()
    vol200 = close.rolling(200).std()
    trend_strength = spread / vol200

    cumret60 = (close / close.shift(60)) - 1.0

    vol30 = logret.rolling(30).std() * np.sqrt(365) * 100.0

    # Drop NaNs pentru distribuții
    ts_hist = trend_strength.dropna().to_numpy()
    cr_hist = cumret60.dropna().to_numpy()
    vol_hist = vol30.dropna().to_numpy()

    # Percentile pentru fiecare punct
    ic_struct_series = percentile_rank_vector(ts_hist, trend_strength.to_numpy())
    ic_dir_series = percentile_rank_vector(cr_hist, cumret60.to_numpy())
    vol_index_series = percentile_rank_vector(vol_hist, vol30.to_numpy())

    # Flux derivat
    ic_flux_series = np.clip(100.0 - vol_index_series, 0, 100)

    records = []

    for i, ts in enumerate(df.index):
        if np.isnan(ic_struct_series[i]) or np.isnan(ic_dir_series[i]):
            continue

        ic_struct = float(ic_struct_series[i])
        ic_dir = float(ic_dir_series[i])
        vol30_ann = float(vol30.iloc[i]) if not np.isnan(vol30.iloc[i]) else None
        vol30_index = float(vol_index_series[i])

        regime = classify_regime(ic_struct, ic_dir)

        rec = {
            "t": int(ts.timestamp() * 1000),
            "close": float(close.iloc[i]),
            "ic_struct": ic_struct,
            "ic_dir": ic_dir,
            "ic_flux": float(ic_flux_series[i]),
            "ic_cycle": 50.0,
            "vol30_ann_pct": vol30_ann,
            "vol30_index": vol30_index,
            "regime": regime.code,
            "regime_label": regime.label,
            "regime_short": regime.short,
            "regime_color": regime.color,
        }
        records.append(rec)

    meta = {
        "as_of": datetime.utcfromtimestamp(records[-1]["t"] / 1000).strftime("%Y-%m-%d"),
        "points": len(records),
        "source": "coeziv-btc-python-fast",
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump({"meta": meta, "series": records}, f, ensure_ascii=False)

    print(f"Generated {len(records)} points")


if __name__ == "__main__":
    main()
