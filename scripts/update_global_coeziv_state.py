import json
from pathlib import Path

import pandas as pd


# === 1. CĂI DE BAZĂ ===

ROOT = Path(__file__).resolve().parent.parent  # rădăcina repo-ului
DATA_GLOBAL = ROOT / "data_global"

# CSV-urile așteptate în data_global/:
FILES = {
    "spx":   ("spx.csv",   "close"),   # S&P 500
    "nasdaq":("nasdaq.csv","close"),   # NASDAQ
    "msci":  ("msci.csv",  "close"),   # MSCI World / URTH
    "vix":   ("vix.csv",   "close"),   # VIX
    "move":  ("move.csv",  "close"),   # MOVE index
    "us10y": ("us10y.csv", "yield"),   # randament obligațiuni 10Y
    "dxy":   ("dxy.csv",   "close"),   # Index USD
    "credit":("credit_spread.csv","spread"),  # spread IG–HY
}


def load_series(path: Path, value_col: str) -> pd.DataFrame:
    """Încarcă un CSV cu coloane: date, <value_col>."""
    if not path.exists():
        raise FileNotFoundError(f"Lipsește fișierul: {path}")
    df = pd.read_csv(path)
    if "date" not in df.columns:
        raise ValueError(f"{path} trebuie să aibă o coloană 'date'")
    if value_col not in df.columns:
        raise ValueError(f"{path} trebuie să aibă o coloană '{value_col}'")
    df["date"] = pd.to_datetime(df["date"])
    df = df[["date", value_col]].dropna()
    return df.sort_values("date")


def norm_0_100(series: pd.Series) -> pd.Series:
    """Normalizează o serie la [0, 100]."""
    s = series.astype("float64")
    s_min = s.min()
    s_max = s.max()
    if pd.isna(s_min) or pd.isna(s_max) or s_max == s_min:
        return pd.Series(50.0, index=s.index)  # fallback neutru
    return 100.0 * (s - s_min) / (s_max - s_min)


def main():
    # === 2. ÎNCĂRCĂM SERIILE ===
    print("⏳ Încarc seriile macro din data_global/ ...")
    data = {}
    for key, (filename, col) in FILES.items():
        df = load_series(DATA_GLOBAL / filename, col)
        data[key] = df.rename(columns={col: key})

    # === 3. MERGE PE DATA COMUNĂ ===
    base = None
    for key, df in data.items():
        if base is None:
            base = df
        else:
            base = base.merge(df, on="date", how="inner")

    if base is None or base.empty:
        raise RuntimeError("Nu s-a putut construi un DataFrame comun cu seriile macro.")

    df = base.copy().sort_values("date")
    df = df.set_index("date")

    # === 4. CALCUL TRENDURI STRUCTURALE PE ACȚIUNI ===
    # Trend relativ: preț / EMA200 - 1
    for idx in ["spx", "nasdaq", "msci"]:
        ema = df[idx].ewm(span=200, min_periods=50).mean()
        df[f"ret_{idx}"] = df[idx] / ema - 1.0

    trend_spx = norm_0_100(df["ret_spx"])
    trend_nas = norm_0_100(df["ret_nasdaq"])
    trend_msci = norm_0_100(df["ret_msci"])

    # === 5. VIX & CREDIT – inversăm (valori mari = stres) ===
    vix_score = 100.0 - norm_0_100(df["vix"])
    cred_score = 100.0 - norm_0_100(df["credit"])

    # === 6. CORELAȚII – simplificat: placeholder stabilitate = 50 ===
    # Poți în viitor să calculezi rolling correlations și variabilitatea lor.
    corel_score = pd.Series(50.0, index=df.index)

    # === 7. IC_GLOBAL ===
    df["ic_global"] = (
        0.30 * trend_spx +
        0.15 * trend_nas +
        0.15 * trend_msci +
        0.15 * corel_score +
        0.15 * vix_score +
        0.10 * cred_score
    )

    # === 8. ICD_GLOBAL – direcționalitatea globală ===
    # Mișcări zilnice normalizate (semn + magnitudine)
    def dir_score(series: pd.Series) -> pd.Series:
        pct = series.pct_change().fillna(0.0)
        return norm_0_100(pct)

    dir_eq   = dir_score(df["spx"] + df["nasdaq"] + df["msci"])
    dir_vix  = 100.0 - dir_score(df["vix"])      # scădere VIX = calm = pozitiv
    dir_cred = 100.0 - dir_score(df["credit"])   # scădere spread = încredere = pozitiv
    dir_dxy  = 100.0 - dir_score(df["dxy"])      # de multe ori, slăbire USD = risk-on
    dir_us10 = 100.0 - dir_score(df["us10y"])    # scăderea randamentelor = risk-on

    df["icd_global"] = (
        0.35 * dir_eq +
        0.20 * dir_dxy +
        0.20 * dir_us10 +
        0.15 * dir_cred +
        0.10 * dir_vix
    )

    df = df.dropna(subset=["ic_global", "icd_global"])
    if df.empty:
        raise RuntimeError("După calcule, nu au rămas rânduri valide pentru ic_global/icd_global.")

    last_date = df.index[-1]
    ic_global_last = float(df["ic_global"].iloc[-1])
    icd_global_last = float(df["icd_global"].iloc[-1])

    state = {
        "date": last_date.strftime("%Y-%m-%d"),
        "ic_global": round(ic_global_last, 2),
        "icd_global": round(icd_global_last, 2)
    }

    # === 9. SCRIEM JSON-UL ===
    out_path = DATA_GLOBAL / "global_coeziv_state.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print("✅ global_coeziv_state.json actualizat:")
    print(json.dumps(state, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
