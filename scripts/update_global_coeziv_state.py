#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_global_coeziv_state.py
Actualizează indicii globali (IC_GLOBAL și ICD_GLOBAL)
folosind date live Yahoo Finance.

Compatibil 100% cu workflow GitHub.
Nu necesită fișiere CSV.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
import json

# ------------------------
# Configurări principale
# ------------------------

DATA_START = "2010-01-01"

# 📌 Salvăm în root/data/
OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MACRO_SYMBOLS = {
    "spx": "^GSPC",         # S&P 500
    "vix": "^VIX",          # Volatility index
    "dxy": "DX-Y.NYB",      # Dollar index (alternativ ^DXY)
    "gold": "GC=F",         # Gold futures
    "oil": "CL=F",          # Crude oil futures
}

# ------------------------
# Funcții utilitare
# ------------------------

def fetch_series_yahoo(symbol: str, column="Adj Close"):
    """
    Descarcă date daily de la Yahoo Finance și returnează
    DataFrame cu: date, close.
    """
    end = datetime.utcnow().strftime("%Y-%m-%d")
    df = yf.download(
        symbol,
        start=DATA_START,
        end=end,
        interval="1d",
        progress=False
    )

    if df.empty:
        raise RuntimeError(f"Nu am primit date pentru {symbol}.")

    # Normalizează seria
    s = df[column].rename("close").to_frame()
    s.index.name = "date"
    s = s.reset_index()

    s["date"] = pd.to_datetime(s["date"]).dt.strftime("%Y-%m-%d")

    return s


def normalize_series(df):
    x = df["close"].astype(float)
    norm = 100 * (x - x.min()) / (x.max() - x.min() + 1e-9)
    df["norm"] = norm
    return df


def compute_cohesive_index(series_list):
    df = series_list[0][["date"]].copy()
    for name, s in series_list:
        df[name] = s["norm"]

    df["IC_GLOBAL"] = df[[name for name, _ in series_list]].mean(axis=1)
    return df[["date", "IC_GLOBAL"]]


def compute_directional_index(series_list):
    df = series_list[0][["date"]].copy()

    # direcții pct-change
    directions = []
    for name, s in series_list:
        pct = s["close"].pct_change().fillna(0)
        directions.append(np.sign(pct))
        df[name] = pct

    # coerența direcțională
    directions = np.vstack(directions)
    agree = np.mean(directions == np.sign(np.sum(directions, axis=0)), axis=0)

    df["ICD_GLOBAL"] = (agree * 100).round(2)
    return df[["date", "ICD_GLOBAL"]]

# ------------------------
# Pipeline principal
# ------------------------

def main():
    print("📡 Descarc seriile macro live din Yahoo Finance...")

    series = {}

    for key, symbol in MACRO_SYMBOLS.items():
        print(f"   → {key}: {symbol}")
        df = fetch_series_yahoo(symbol)
        df = normalize_series(df)
        series[key] = df

    series_list = [(name, df) for name, df in series.items()]

    print("📊 Calculez IC_GLOBAL...")
    ic = compute_cohesive_index(series_list)

    print("📊 Calculez ICD_GLOBAL...")
    icd = compute_directional_index(series_list)

    merged = ic.merge(icd, on="date")

    # 📌 Salvare în root/data/global_coeziv_state.json
    output_file = OUTPUT_DIR / "global_coeziv_state.json"
    merged.to_json(output_file, orient="records", indent=2)

    print(f"✅ Salvat: {output_file}")
    print("✨ Actualizare completă!")


if __name__ == "__main__":
    main()
