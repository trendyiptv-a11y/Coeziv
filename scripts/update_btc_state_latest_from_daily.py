import json
from math import log, sqrt, tanh
from pathlib import Path
from datetime import datetime

# Directoare
ROOT = Path(__file__).resolve().parent.parent
DATA_BTC = ROOT / "data"

INPUT_FILE = DATA_BTC / "btc_ohlc.json"
OUTPUT_FILE = DATA_BTC / "btc_state_latest.json"


# ------------ PARSE DATE ------------

def parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Format de dată necunoscut: {s}")


# ------------ EMA ------------

def ema(series, window):
    alpha = 2 / (window + 1)
    out = [None] * len(series)

    for i, v in enumerate(series):
        if v is None:
            out[i] = None
            continue

        if i == 0 or out[i - 1] is None:
            out[i] = v
        else:
            out[i] = alpha * v + (1 - alpha) * out[i - 1]

    return out


# ------------ ROLLING STD ------------

def rolling_std(series, window):
    out = [None] * len(series)
    buf = []

    for i, r in enumerate(series):
        if r is None:
            out[i] = None
            continue

        buf.append(r)
        if len(buf) > window:
            buf.pop(0)

        if len(buf) < window:
            out[i] = None
        else:
            mean = sum(buf) / len(buf)
            var = sum((x - mean) ** 2 for x in buf) / len(buf)
            out[i] = sqrt(var)

    return out


# ------------ CALCUL IC STRUCTURAL ------------

def calc_ic_struct(ema50, ema200):
    ic = [None] * len(ema50)

    for i in range(len(ema50)):
        if ema50[i] is None or ema200[i] is None:
            continue
        x = (ema50[i] - ema200[i]) / max(ema200[i], 1e-9)
        ic[i] = tanh(2.5 * x)

    return ic


# ------------ CALCUL IC DIRECȚIONAL ------------

def calc_ic_dir(log_ret, vol30):
    ic = [None] * len(log_ret)

    for i in range(len(log_ret)):
        if log_ret[i] is None or vol30[i] is None:
            continue

        if vol30[i] < 1e-9:
            ic[i] = 0.0
            continue

        x = log_ret[i] / vol30[i]
        ic[i] = tanh(1.8 * x)

    return ic


# ------------ MAIN ------------

def main():
    print("📥 Încarc btc_ohlc.json ...")

    with open(INPUT_FILE, "r") as f:
        raw = json.load(f)

    # 2) Transformăm în candles
    candles = []

    for row in raw:

        # 1) Timestamp (milisecunde)
        ts = row.get("timestamp")
        if ts is not None:
            try:
                dt = datetime.utcfromtimestamp(int(ts) / 1000)
            except (ValueError, OSError):
                continue
        else:
            # 2) fallback: încearcă string time/date/t
            date_str = row.get("time") or row.get("date") or row.get("t")
            if not date_str:
                continue

            try:
                dt = parse_date(str(date_str))
            except ValueError:
                continue

        close = row.get("close")
        if close is None:
            continue

        candles.append({
            "dt": dt,
            "close": float(close)
        })

    if len(candles) < 260:
        raise RuntimeError("Prea puține date BTC pentru a calcula IC (minim ~260 zile).")

    # sortare
    candles.sort(key=lambda c: c["dt"])

    closes = [c["close"] for c in candles]

    # log returns
    log_ret = [None] * len(closes)
    for i in range(1, len(closes)):
        if closes[i - 1] > 0 and closes[i] > 0:
            log_ret[i] = log(closes[i] / closes[i - 1])
        else:
            log_ret[i] = None

    # EMA50 & EMA200
    ema50 = ema(closes, 50)
    ema200 = ema(closes, 200)

    # volatilitate 30 zile anualizată
    std30 = rolling_std(log_ret, 30)
    vol30 = [
        None if s is None else s * sqrt(365.0) * 100
        for s in std30
    ]

    # IC structural & direcțional
    ic_struct = calc_ic_struct(ema50, ema200)
    ic_dir = calc_ic_dir(log_ret, vol30)

    latest = {
        "dt": candles[-1]["dt"].strftime("%Y-%m-%d"),
        "close": closes[-1],
        "ema50": ema50[-1],
        "ema200": ema200[-1],
        "vol30": vol30[-1],
        "ic_struct": ic_struct[-1],
        "ic_dir": ic_dir[-1]
    }

    print("📤 Scriu btc_state_latest.json ...")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(latest, f, indent=2)

    print("✅ Actualizare completă:", latest)


if __name__ == "__main__":
    main()
