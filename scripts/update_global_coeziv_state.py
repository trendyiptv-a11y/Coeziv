#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
update_global_coeziv_state.py

Descarcă seriile macro globale necesare pentru Modelul Coeziv Global:

- SPX  = S&P 500
- VIX  = Volatility Index
- DXY  = Dollar Index
- GOLD = Gold futures
- OIL  = Crude Oil futures

Salvează fișiere CSV curate în:

    data_global/spx.csv
    data_global/vix.csv
    data_global/dxy.csv
    data_global/gold.csv
    data_global/oil.csv

Formatul final este obligatoriu:

    date,close
    2009-01-02,931.80
    2009-01-05,927.45
    ...

Important:
- NU salvează index numeric 0,1,2,3...
- NU salvează timestamp fals.
- Salvează dată reală calendaristică.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import pandas as pd
import yfinance as yf


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DATA_GLOBAL = ROOT / "data_global"

START_DATE = "2009-01-01"

SERIES: Dict[str, str] = {
    "spx": "^GSPC",
    "vix": "^VIX",
    "dxy": "DX-Y.NYB",
    "gold": "GC=F",
    "oil": "CL=F",
}


# ---------------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {msg}", flush=True)


def normalize_downloaded_frame(df: pd.DataFrame, name: str, ticker: str) -> pd.DataFrame:
    """
    Primește DataFrame de la yfinance și returnează DataFrame curat:

        date, close

    Protecții:
    - elimină MultiIndex dacă apare
    - folosește Adj Close dacă există, altfel Close
    - păstrează doar date reale
    - elimină duplicatele
    - sortează cronologic
    """
    if df is None or df.empty:
        raise RuntimeError(f"{name}/{ticker}: yfinance a returnat DataFrame gol.")

    # Dacă yfinance returnează coloane MultiIndex, le simplificăm.
    if isinstance(df.columns, pd.MultiIndex):
        # Pentru download cu un singur ticker, de obicei nivelul relevant conține
        # Open/High/Low/Close/Adj Close/Volume. Încercăm să păstrăm acest nivel.
        possible = []
        for level in range(df.columns.nlevels):
            vals = set(str(v) for v in df.columns.get_level_values(level))
            if "Close" in vals or "Adj Close" in vals:
                possible.append(level)

        if possible:
            level = possible[0]
            df.columns = df.columns.get_level_values(level)
        else:
            df.columns = ["_".join(str(x) for x in col if str(x)) for col in df.columns]

    df = df.copy()

    # Alegem coloana de preț.
    if "Adj Close" in df.columns:
        close_col = "Adj Close"
    elif "Close" in df.columns:
        close_col = "Close"
    else:
        raise RuntimeError(
            f"{name}/{ticker}: nu găsesc coloana Close sau Adj Close. "
            f"Coloane disponibile: {list(df.columns)}"
        )

    # Indexul de la yfinance este data reală.
    out = pd.DataFrame({
        "date": pd.to_datetime(df.index, errors="coerce"),
        "close": pd.to_numeric(df[close_col], errors="coerce"),
    })

    out = out.dropna(subset=["date", "close"])

    if out.empty:
        raise RuntimeError(f"{name}/{ticker}: nu au rămas date valide după curățare.")

    # Transformăm data în format stabil YYYY-MM-DD.
    out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    out = out.dropna(subset=["date", "close"])

    # Eliminăm duplicatele pe aceeași zi.
    before = len(out)
    out = out.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    removed = before - len(out)

    if removed:
        log(f"  • {name}: eliminate {removed} date duplicate.")

    # Verificare anti-1970 / anti-index numeric.
    first_date = str(out["date"].iloc[0])
    last_date = str(out["date"].iloc[-1])

    if first_date.startswith("1970") and last_date.startswith("1970"):
        raise RuntimeError(
            f"{name}/{ticker}: datele arată ca timestamp/index greșit: "
            f"{first_date} – {last_date}"
        )

    return out[["date", "close"]]


def download_series(name: str, ticker: str) -> pd.DataFrame:
    log(f"Descarc {ticker} pentru {name} din Yahoo Finance (începând cu {START_DATE})...")

    df = yf.download(
        ticker,
        start=START_DATE,
        progress=False,
        auto_adjust=False,
        threads=False,
    )

    out = normalize_downloaded_frame(df, name=name, ticker=ticker)

    log(
        f"  • {name}: {len(out)} puncte | "
        f"{out['date'].iloc[0]} – {out['date'].iloc[-1]}"
    )

    return out


def save_series(name: str, df: pd.DataFrame) -> None:
    DATA_GLOBAL.mkdir(parents=True, exist_ok=True)

    path = DATA_GLOBAL / f"{name}.csv"
    df.to_csv(path, index=False, encoding="utf-8")

    log(f"✔ Salvat {name}.csv cu {len(df)} puncte în {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    log("Pornesc update_global_coeziv_state.py")

    DATA_GLOBAL.mkdir(parents=True, exist_ok=True)

    for name, ticker in SERIES.items():
        try:
            df = download_series(name, ticker)
            save_series(name, df)
        except Exception as exc:
            raise RuntimeError(f"Eroare la seria {name} ({ticker}): {exc}") from exc

    log("✅ Update global coeziv – seriile macro descărcate cu succes.")


if __name__ == "__main__":
    main()
