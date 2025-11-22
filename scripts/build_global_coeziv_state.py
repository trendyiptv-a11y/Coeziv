#!/usr/bin/env python3
import json
from pathlib import Path

import numpy as np
import pandas as pd


# ------------------------------------------------------
# CONFIG – adaptează doar dacă schimbi structura repo-ului
# ------------------------------------------------------
DATA_GLOBAL_DIR = Path("data_global")

ASSETS = {
    "spx": DATA_GLOBAL_DIR / "spx.csv",   # indice bursier
    "dxy": DATA_GLOBAL_DIR / "dxy.csv",   # dolar
    "gold": DATA_GLOBAL_DIR / "gold.csv", # aur
    "vix": DATA_GLOBAL_DIR / "vix.csv",   # volatilitate
    "oil": DATA_GLOBAL_DIR / "oil.csv",   # petrol
}

FAST_WINDOW = 20   # SMA rapid
SLOW_WINDOW = 100  # SMA lent

MAX_DAYS = 2000    # opcțional: limităm seria globală


# ------------------------------------------------------
# UTILITARE
# ------------------------------------------------------
def load_price_series_from_timestamp_csv(path: Path) -> pd.DataFrame:
    """
    CSV-urile tale au schema:
      - timestamp (ms, float)
      - close (string, cu prima linie simbol: 'DX-Y.NYB', '^VIX', etc.)
    Întoarce un DataFrame cu:
      - date (datetime)
      - close (float)
    """
    if not path.exists():
        raise FileNotFoundError(f"Fișier lipsă: {path}")

    df = pd.read_csv(path)

    # aruncăm rândurile fără timestamp
    df = df.dropna(subset=["timestamp"])

    # convertim timestamp (ms) -> datetime
    df["date"] = pd.to_datetime(df["timestamp"], unit="ms", errors="coerce")

    # convertim close la numeric; prima linie cu simbol va deveni NaN
    df["close"] = pd.to_numeric(df["close"], errors="coerce")

    df = df.dropna(subset=["date", "close"]).copy()
    df = df.sort_values("date")

    return df[["date", "close"]]


def add_trend_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adaugă:
      - sma_fast, sma_slow
      - above_slow: preț > SMA(100)  (structură)
      - trend_up: SMA(20) > SMA(100) (direcționalitate)
    """
    df = df.copy()
    df["sma_fast"] = df["close"].rolling(FAST_WINDOW, min_periods=FAST_WINDOW).mean()
    df["sma_slow"] = df["close"].rolling(SLOW_WINDOW, min_periods=SLOW_WINDOW).mean()

    df["above_slow"] = df["close"] > df["sma_slow"]
    df["trend_up"] = df["sma_fast"] > df["sma_slow"]
    return df


# ------------------------------------------------------
# LOGICĂ GLOBALĂ
# ------------------------------------------------------
def build_global_state():
    # 1. Încarcă seriile și adaugă trend features
    asset_frames = {}
    for name, path in ASSETS.items():
        df = load_price_series_from_timestamp_csv(path)
        df = add_trend_features(df)
        asset_frames[name] = df[["date", "close", "above_slow", "trend_up"]].copy()

    # 2. Merge pe dată (doar zile comune tuturor activelor)
    merged = None
    for name, df in asset_frames.items():
        df_local = df.rename(
            columns={
                "close": f"{name}_close",
                "above_slow": f"{name}_above_slow",
                "trend_up": f"{name}_trend_up",
            }
        )
        if merged is None:
            merged = df_local
        else:
            merged = pd.merge(merged, df_local, on="date", how="inner")

    if merged is None or merged.empty:
        raise RuntimeError("Nu am obținut niciun interval comun de date pentru seriile globale.")

    merged = merged.sort_values("date")
    if MAX_DAYS is not None and len(merged) > MAX_DAYS:
        merged = merged.iloc[-MAX_DAYS:]

    asset_names = list(ASSETS.keys())
    above_cols = [f"{a}_above_slow" for a in asset_names]
    trend_cols = [f"{a}_trend_up" for a in asset_names]

    merged["n_assets"] = len(asset_names)
    merged["n_struct_strong"] = merged[above_cols].sum(axis=1)
    merged["n_trend_up"] = merged[trend_cols].sum(axis=1)

    # IC_GLOBAL structural = proporție active peste SMA_slow * 100
    merged["ic_global"] = (merged["n_struct_strong"] / merged["n_assets"]) * 100.0
    # ICD_GLOBAL direcțional = proporție active cu trend_up * 100
    merged["icd_global"] = (merged["n_trend_up"] / merged["n_assets"]) * 100.0

    # 4. Praguri din distribuția istorică
    ic_series = merged["ic_global"].dropna()
    icd_series = merged["icd_global"].dropna()

    if len(ic_series) < 10 or len(icd_series) < 10:
        ic_low, ic_high = 35.0, 65.0
        icd_low, icd_high = 40.0, 60.0
    else:
        ic_low = float(np.percentile(ic_series, 30))
        ic_high = float(np.percentile(ic_series, 70))
        icd_low = float(np.percentile(icd_series, 30))
        icd_high = float(np.percentile(icd_series, 70))

    thresholds = {
        "ic_low": round(ic_low, 2),
        "ic_high": round(ic_high, 2),
        "icd_low": round(icd_low, 2),
        "icd_high": round(icd_high, 2),
    }

    # 5. Clasificare regim global
    def classify_regime(row):
        ic = row["ic_global"]
        icd = row["icd_global"]
        if not np.isfinite(ic) or not np.isfinite(icd):
            return "neutral"
        if ic >= ic_high and icd >= icd_high:
            return "bull"
        if ic >= ic_high and icd <= icd_low:
            return "bear"
        # alte combinații = tranziție / neutru
        return "neutral"

    merged["regime"] = merged.apply(classify_regime, axis=1)

    # 6. Construim JSON: series + current + thresholds
    series = []
    for _, row in merged.iterrows():
        ts_ms = int(pd.Timestamp(row["date"]).timestamp() * 1000)
        ic_val = row["ic_global"]
        icd_val = row["icd_global"]

        series.append(
            {
                "t": ts_ms,
                "ic_global": round(float(ic_val), 2) if np.isfinite(ic_val) else None,
                "icd_global": round(float(icd_val), 2) if np.isfinite(icd_val) else None,
                "regime": row["regime"],
            }
        )

    if not series:
        raise RuntimeError("Nu am generat niciun punct valid în series.")

    current = series[-1]

    global_state = {
        "series": series,
        "current": current,
        "thresholds": thresholds,
    }

    # 7. Scriem în data/global_coeziv_state.json (exact ce citește ic_global.html)
    out_dir = Path("data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "global_coeziv_state.json"

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(global_state, f, ensure_ascii=False)

    print(f"[OK] Scris {out_path} cu {len(series)} puncte; ultima dată = {current['t']}.")


if __name__ == "__main__":
    build_global_state()
