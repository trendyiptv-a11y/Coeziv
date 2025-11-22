#!/usr/bin/env python3
import os
import json
from pathlib import Path

import pandas as pd
import numpy as np


# ------------------------------------------------------
# CONFIG – adaptează doar dacă ai alte nume de fișiere
# ------------------------------------------------------
DATA_GLOBAL_DIR = Path("data_global")

ASSETS = {
    "spx": DATA_GLOBAL_DIR / "spx.csv",   # indice bursier
    "dxy": DATA_GLOBAL_DIR / "dxy.csv",   # dolar
    "gold": DATA_GLOBAL_DIR / "gold.csv", # aur
    "vix": DATA_GLOBAL_DIR / "vix.csv",   # volatilitate
    "oil": DATA_GLOBAL_DIR / "oil.csv",   # petrol
}

# fereastră pentru medii mobile
FAST_WINDOW = 20
SLOW_WINDOW = 100

# câte zile maxime păstrăm în seria globală (optional)
MAX_DAYS = 2000  # ~8 ani de date (la 250 zile tranzacționabile / an)


# ------------------------------------------------------
# UTILS
# ------------------------------------------------------
def load_price_series(path: Path) -> pd.DataFrame:
    """
    Încarcă un CSV cu coloane:
      - 'date' sau 'Date'
      - 'close' sau 'Close' sau 'Adj Close'
    Întoarce DataFrame cu coloane: ['date', 'close'].
    """
    if not path.exists():
        raise FileNotFoundError(f"Fișier lipsă: {path}")

    df = pd.read_csv(path)

    # normalizare nume coloană dată
    date_col = None
    for cand in ["date", "Date", "DATE"]:
        if cand in df.columns:
            date_col = cand
            break
    if date_col is None:
        raise ValueError(f"Nu am găsit coloană de dată în {path} (aștept 'date' sau 'Date').")

    # normalizare nume coloană close
    close_col = None
    for cand in ["close", "Close", "Adj Close", "adj_close", "AdjClose"]:
        if cand in df.columns:
            close_col = cand
            break
    if close_col is None:
        # fallback: ultima coloană numerică
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            raise ValueError(f"Nu am găsit coloană numerică de preț în {path}.")
        close_col = numeric_cols[-1]

    out = df[[date_col, close_col]].copy()
    out.columns = ["date", "close"]
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out.dropna(subset=["date"]).sort_values("date")
    out = out.dropna(subset=["close"])
    return out


def add_trend_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adaugă medii mobile rapide și lente și coloane:
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
    # 1. Încarcă toate seriile și adaugă trend features
    asset_frames = {}
    for name, path in ASSETS.items():
        df = load_price_series(path)
        df = add_trend_features(df)
        # păstrăm doar coloanele relevante
        asset_frames[name] = df[["date", "close", "above_slow", "trend_up"]].copy()

    # 2. Facem merge pe dată (inner join – doar zile comune)
    merged = None
    for name, df in asset_frames.items():
        df_local = df.copy()
        df_local = df_local.rename(
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
        raise RuntimeError("Nu am reușit să fuzionez seriile globale (fără interval comun).")

    # opțional limităm la ultimele MAX_DAYS
    merged = merged.sort_values("date")
    if MAX_DAYS is not None and len(merged) > MAX_DAYS:
        merged = merged.iloc[-MAX_DAYS:]

    # 3. Calculăm IC_GLOBAL și ICD_GLOBAL pe bază de proporții
    asset_names = list(ASSETS.keys())
    above_cols = [f"{a}_above_slow" for a in asset_names]
    trend_cols = [f"{a}_trend_up" for a in asset_names]

    merged["n_assets"] = len(asset_names)
    merged["n_struct_strong"] = merged[above_cols].sum(axis=1)
    merged["n_trend_up"] = merged[trend_cols].sum(axis=1)

    # IC_GLOBAL structural = proporție de active peste SMA_slow * 100
    merged["ic_global"] = (merged["n_struct_strong"] / merged["n_assets"]) * 100.0
    # ICD_GLOBAL direcțional = proporție de active cu trend_up * 100
    merged["icd_global"] = (merged["n_trend_up"] / merged["n_assets"]) * 100.0

    # 4. Praguri (thresholds) din distribuția istorică
    ic_series = merged["ic_global"].dropna()
    icd_series = merged["icd_global"].dropna()

    if len(ic_series) < 10 or len(icd_series) < 10:
        # fallback simplu
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

    # 5. Clasificăm regimul global
    def classify_regime(row):
        ic = row["ic_global"]
        icd = row["icd_global"]
        if not np.isfinite(ic) or not np.isfinite(icd):
            return "neutral"
        if ic >= ic_high and icd >= icd_high:
            return "bull"
        if ic >= ic_high and icd <= icd_low:
            return "bear"
        # poți complica logică mai târziu (ex: ic foarte mic + icd mic = bear)
        return "neutral"

    merged["regime"] = merged.apply(classify_regime, axis=1)

    # 6. Construim structura JSON: series + current + thresholds
    series = []
    for _, row in merged.iterrows():
        ts = int(pd.Timestamp(row["date"]).timestamp() * 1000)
        series.append(
            {
                "t": ts,
                "ic_global": round(float(row["ic_global"]), 2) if np.isfinite(row["ic_global"]) else None,
                "icd_global": round(float(row["icd_global"]), 2) if np.isfinite(row["icd_global"]) else None,
                "regime": row["regime"],
            }
        )

    if not series:
        raise RuntimeError("Nu am obținut niciun punct valid pentru seria globală.")

    current = series[-1]

    global_state = {
        "series": series,
        "current": current,
        "thresholds": thresholds,
    }

    # 7. Scriem în data/global_coeziv_state.json
    out_dir = Path("data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "global_coeziv_state.json"

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(global_state, f, ensure_ascii=False)

    print(f"[OK] Scris {out_path} cu {len(series)} puncte; current date = {current['t']}.")


if __name__ == "__main__":
    build_global_state()
