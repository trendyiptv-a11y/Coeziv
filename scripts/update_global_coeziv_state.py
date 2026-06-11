#!/usr/bin/env python
"""
update_global_coeziv_state.py

Script simplu care descarcă serii macro zilnice din Yahoo Finance
și le salvează în data_global/*.csv în format:

    timestamp,close

timestamp = milisecunde UNIX (UTC)
"""

from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime
from typing import Dict

import pandas as pd
import yfinance as yf


# Rădăcina repo-ului (../ față de scripts/)
ROOT = Path(__file__).resolve().parents[1]

# Folder unde salvăm seriile globale
DATA_GLOBAL = ROOT / "data_global"

# Serii macro pe care le luăm din Yahoo Finance
SERIES: Dict[str, str] = {
    "spx": "^GSPC",   # S&P 500 index
    "vix": "^VIX",    # Volatilitate
    "dxy": "DX-Y.NYB",  # Dollar Index (poți schimba în "^DXY" dacă preferi)
    "gold": "GC=F",   # Gold futures
    "oil": "CL=F",    # Crude oil futures
}

START_DATE = "2009-01-01"  # punct de start (poți ajusta)


def log(msg: str) -> None:
    """Mic helper pentru mesaje frumoase în logul GitHub Actions."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {msg}", flush=True)


def fetch_series_yahoo(symbol: str, start: str) -> pd.DataFrame:
    """
    Descarcă o serie zilnică de la Yahoo Finance.

    Returnează un DataFrame cu coloanele:
        - timestamp (ms UNIX)
        - close
    """
    log(f"  • Descarc {symbol} din Yahoo Finance (începând cu {start})...")
    data = yf.download(symbol, start=start, progress=False)

    if data is None or data.empty:
        raise RuntimeError(f"Nu am primit date pentru simbolul '{symbol}'")

    # yfinance poate returna coloane MultiIndex în versiunile noi.
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    # Folosim coloana Close
    if "Close" not in data.columns:
        raise RuntimeError(f"Răspunsul pentru '{symbol}' nu are coloana 'Close'")

    df = data[["Close"]].copy()
    df.rename(columns={"Close": "close"}, inplace=True)

    # Indexul este data; îl transformăm în timestamp ms.
    df.index = pd.to_datetime(df.index, utc=True)
    df.reset_index(inplace=True)
    if "Date" in df.columns:
        df.rename(columns={"Date": "date"}, inplace=True)
    elif "Datetime" in df.columns:
        df.rename(columns={"Datetime": "date"}, inplace=True)
    else:
        first_col = df.columns[0]
        df.rename(columns={first_col: "date"}, inplace=True)

    # Compatibil cu pandas 2.x și 3.x: Series.view("int64") nu mai este sigur.
    df["timestamp"] = (pd.to_datetime(df["date"], utc=True).astype("int64") // 10**6).astype("int64")

    # Păstrăm doar ce ne interesează
    df = df[["timestamp", "close"]].sort_values("timestamp")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"])
    return df


def save_series_csv(name: str, df: pd.DataFrame) -> Path:
    """
    Salvează seria în data_global/<name>.csv și întoarce calea fișierului.
    """
    DATA_GLOBAL.mkdir(parents=True, exist_ok=True)
    out_path = DATA_GLOBAL / f"{name}.csv"
    df.to_csv(out_path, index=False)
    log(f"  ✔ Salvat {name}.csv cu {len(df)} puncte în {out_path.relative_to(ROOT)}")
    return out_path


def main() -> int:
    log("🚀 Pornesc update_global_coeziv_state.py")
    log(f"Rădăcina repo-ului: {ROOT}")
    log(f"Folder data_global: {DATA_GLOBAL}")

    created_files = []

    for name, symbol in SERIES.items():
        try:
            df = fetch_series_yahoo(symbol, START_DATE)
        except Exception as e:
            log(f"  ⚠ Eroare la descărcarea '{symbol}' pentru '{name}': {e}")
            continue

        try:
            path = save_series_csv(name, df)
            created_files.append(path)
        except Exception as e:
            log(f"  ⚠ Eroare la salvarea '{name}.csv': {e}")

    if not created_files:
        log("❌ Nu am reușit să actualizez nicio serie. Verifică simbolurile / conexiunea.")
        return 1

    log("✅ Update global coeziv – serii macro descărcate cu succes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
