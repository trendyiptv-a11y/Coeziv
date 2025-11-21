import json
from math import log, sqrt, tanh
from pathlib import Path
from datetime import datetime


ROOT = Path(__file__).resolve().parent.parent
DATA_BTC = ROOT / "data"

INPUT_FILE = DATA_BTC / "btc_ohlc.json"
OUTPUT_FILE = DATA_BTC / "btc_state_latest.json"


# ---------- Utilitare ----------

def ema(series, window):
    alpha = 2.0 / (window + 1.0)
    out = [None] * len(series)
    ema_val = None
    for i, x in enumerate(series):
        if x is None:
            out[i] = None
            continue
        x = float(x)
        if ema_val is None:
            ema_val = x
        else:
            ema_val = alpha * x + (1.0 - alpha) * ema_val
        out[i] = ema_val
    return out


def rolling_std(series, window):
    out = [None] * len(series)
    buf = []
    for i, x in enumerate(series):
        if x is None:
            buf.append(None)
        else:
            buf.append(float(x))
        if len(buf) > window:
            buf.pop(0)

        clean = [v for v in buf if v is not None]
        if len(clean) < window:
            out[i] = None
            continue
        m = sum(clean) / len(clean)
        var = sum((v - m) ** 2 for v in clean) / len(clean)
        out[i] = sqrt(var)
    return out


def min_max_norm(series, floor=0.0, ceil=100.0):
    vals = [x for x in series if x is not None]
    if not vals:
        return [None] * len(series)
    mn = min(vals)
    mx = max(vals)
    if mx == mn:
        return [50.0 if x is not None else None for x in series]

    out = []
    for x in series:
        if x is None:
            out.append(None)
        else:
            z = (x - mn) / (mx - mn)
            out.append(floor + z * (ceil - floor))
    return out


# ---------- Regim coeziv ----------

def infer_coeziv_regime(last_point: dict) -> dict:
    """
    Primește ultimul punct cu:
      - close, ema50, ema200, vol30, ic_struct, ic_dir
    Întoarce:
      - label: descriere completă
      - short: etichetă scurtă
    """

    ic = last_point.get("ic_struct")
    icd = last_point.get("ic_dir")
    close = last_point.get("close")
    ema50 = last_point.get("ema50")
    ema200 = last_point.get("ema200")
    vol30 = last_point.get("vol30")

    if (
        ic is None
        or icd is None
        or close is None
        or ema50 is None
        or ema200 is None
        or vol30 is None
    ):
        return {
            "label": "Regim neclar (date insuficiente pentru structură completă)",
            "short": "neclar",
        }

    ic = float(ic)
    icd = float(icd)
    close = float(close)
    ema50 = float(ema50)
    ema200 = float(ema200)
    vol30 = float(vol30)

    rel50 = (close - ema50) / ema50 * 100.0
    rel200 = (close - ema200) / ema200 * 100.0

    ic_low = 35.0
    ic_mid = 55.0
    ic_high = 70.0

    def is_bull_trend():
        return rel50 > 3.0 and ema50 > ema200 and rel200 > 0.0

    def is_bear_trend():
        return rel50 < -3.0 and ema50 < ema200 and rel200 < 0.0

    def is_flat_zone():
        return abs(rel50) <= 3.0 and abs(rel200) <= 3.0

    low_vol = vol30 < 35.0
    high_vol = vol30 >= 70.0

    # 1) Bază / compresie structurală
    if ic < ic_low and 45.0 <= icd <= 55.0 and is_flat_zone() and low_vol:
        return {
            "label": "Bază / compresie structurală (Faza 0)",
            "short": "bază / compresie",
        }

    # 2) Acumulare timpurie
    if ic_low <= ic < ic_mid and icd >= 48.0 and rel200 <= 5.0:
        return {
            "label": "Acumulare timpurie în interiorul mega-ciclului",
            "short": "acumulare",
        }

    # 3) Bull structural
    if ic >= ic_mid and icd > 55.0 and is_bull_trend() and not high_vol:
        return {
            "label": "Bull structural (trend ascendent coerent)",
            "short": "bull structural",
        }

    # 4) Bull târziu / pre-top structural
    if ic >= ic_mid and icd > 50.0 and is_bull_trend() and high_vol:
        return {
            "label": "Bull târziu / început de top structural (pre-top)",
            "short": "bull târziu / pre-top",
        }

    # 5) Top structural / distribuție
    if ic >= ic_mid and icd < 50.0 and is_flat_zone() and high_vol:
        return {
            "label": "Top structural / distribuție (tranziție bull → bear)",
            "short": "top / distribuție",
        }

    # 6) Bear structural
    if ic >= ic_mid and icd < 45.0 and is_bear_trend():
        return {
            "label": "Bear structural (trend descendent coerent)",
            "short": "bear structural",
        }

    # 7) Reechilibrare / post-bear
    if ic < ic_mid and 45.0 <= icd <= 55.0 and not high_vol and not is_bull_trend():
        return {
            "label": "Reechilibrare post-bear / tranziție spre nouă bază",
            "short": "reechilibrare",
        }

    # fallback
    return {
        "label": "Regim mixt / de tranziție (configurație neclară)",
        "short": "mixt / tranziție",
    }


# ---------- MAIN ----------

def main():
    print(f"[BTC] Încarc {INPUT_FILE} ...")
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Lipsește fișierul: {INPUT_FILE}")

    with INPUT_FILE.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    candles = []
    for row in raw:
        # Așteptăm dict cu timestamp (ms) și close
        if not isinstance(row, dict):
            continue

        ts = row.get("timestamp")
        if ts is None:
            # fallback: dată textuală
            date_str = (
                row.get("time")
                or row.get("date")
                or row.get("t")
                or row.get("dt")
            )
            if not date_str:
                continue
            try:
                dt = datetime.fromisoformat(str(date_str).replace("Z", ""))
            except ValueError:
                continue
        else:
            # timestamp în milisecunde
            try:
                dt = datetime.utcfromtimestamp(int(ts) / 1000.0)
            except (ValueError, OSError):
                continue

        close = row.get("close")
        if close is None:
            continue

        candles.append({"dt": dt, "close": float(close)})

    if len(candles) < 260:
        raise RuntimeError(
            f"Prea puține date BTC pentru a calcula IC (minim ~260 zile, avem {len(candles)})"
        )

    # sortăm
    candles.sort(key=lambda c: c["dt"])
    closes = [c["close"] for c in candles]

    # log-returns
    log_ret = [None] * len(closes)
    for i in range(1, len(closes)):
        p0 = closes[i - 1]
        p1 = closes[i]
        if p0 > 0 and p1 > 0:
            log_ret[i] = log(p1 / p0)
        else:
            log_ret[i] = None

    # EMA-uri
    ema50 = ema(closes, 50)
    ema200 = ema(closes, 200)

    # vol 30 zile anualizată
    std30 = rolling_std(log_ret, 30)
    vol30 = [
        None if s is None else s * sqrt(365.0) * 100.0
        for s in std30
    ]

    # IC structural
    struct_raw = []
    for i in range(len(closes)):
        p = closes[i]
        e50 = ema50[i]
        e200 = ema200[i]
        if p is None or e50 is None or e200 is None:
            struct_raw.append(None)
            continue
        slope = (e50 - e200) / max(abs(e200), 1e-9)
        dist = (p - e50) / max(abs(e50), 1e-9)
        struct_raw.append(abs(slope) + 0.5 * abs(dist))

    ic_struct_series = min_max_norm(struct_raw, 0.0, 100.0)

    # IC direcțional
    # netezim log_ret cu EMA 10
    smooth_ret = ema(log_ret, 10)
    dir_raw = []
    for r in smooth_ret:
        if r is None:
            dir_raw.append(None)
        else:
            dir_raw.append(tanh(r * 20.0))  # comprimăm extremele

    ic_dir_series = []
    for x in dir_raw:
        if x is None:
            ic_dir_series.append(None)
        else:
            ic_dir_series.append(50.0 + 50.0 * x)  # map [-1,1] -> [0,100]

    # construim punctele extinse
    extended = []
    for i, c in enumerate(candles):
        extended.append(
            {
                "dt": c["dt"],
                "close": c["close"],
                "ema50": ema50[i],
                "ema200": ema200[i],
                "vol30": vol30[i],
                "ic_struct": ic_struct_series[i],
                "ic_dir": ic_dir_series[i],
            }
        )

    last = extended[-1]

    # infer regim
    regime_info = infer_coeziv_regime(last)

    state = {
        "date": last["dt"].strftime("%Y-%m-%d"),
        "close": last["close"],
        "ema50": last["ema50"],
        "ema200": last["ema200"],
        "vol30": last["vol30"],
        "ic_struct": last["ic_struct"],
        "ic_dir": last["ic_dir"],
        "regime_coeziv_label": regime_info["label"],
        "regime_coeziv_short": regime_info["short"],
        "n_points": len(extended),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print(f"[BTC] Scris {OUTPUT_FILE} pentru data {state['date']}")
    print(json.dumps(state, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
