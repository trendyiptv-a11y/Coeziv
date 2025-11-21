import json
from math import log, sqrt, tanh
from pathlib import Path
from datetime import datetime


ROOT = Path(__file__).resolve().parent.parent  # rădăcina repo-ului
DATA_BTC = ROOT / "data"

INPUT_FILE = DATA_BTC / "btc_ohlc.json"       # ← AICI folosim btc_ohlc.json
OUTPUT_FILE = DATA_BTC / "btc_state_latest.json"


def parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Format de dată necunoscut: {s!r}")


def ema(series, period):
    """EMA ca în JS: alpha = 2 / (period + 1)."""
    alpha = 2.0 / (period + 1.0)
    out = [None] * len(series)
    prev = None
    for i, v in enumerate(series):
        if v is None:
            out[i] = None
            continue
        if prev is None:
            prev = v
        else:
            prev = alpha * v + (1 - alpha) * prev
        out[i] = prev
    return out


def rolling_std(values, window):
    """STD rulant simplu, ca în JS (pe log-returnuri)."""
    out = [None] * len(values)
    if window <= 1:
        return out
    from collections import deque

    q = deque()
    sum_ = 0.0
    sum_sq = 0.0

    for i, v in enumerate(values):
        v = 0.0 if v is None else float(v)
        q.append(v)
        sum_ += v
        sum_sq += v * v

        if len(q) > window:
            old = q.popleft()
            sum_ -= old
            sum_sq -= old * old

        if len(q) == window:
            mean = sum_ / window
            var = sum_sq / window - mean * mean
            out[i] = sqrt(max(var, 0.0))
        else:
            out[i] = None
    return out


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Nu am găsit {INPUT_FILE}. Ajustează numele dacă fișierul e altfel."
        )

    raw = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("btc_ohlc.json trebuie să fie o listă de obiecte (candles).")

    # Extragem (date, close)
    candles = []
    for row in raw:
        # încearcă time/date/t
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
        candles.append({"dt": dt, "close": float(close)})

    if len(candles) < 260:
        raise RuntimeError("Prea puține date BTC pentru a calcula IC (minim ~260 zile).")

    # sortăm după dată
    candles.sort(key=lambda c: c["dt"])
    closes = [c["close"] for c in candles]

    # log-return-uri
    log_ret = [None] * len(closes)
    for i in range(1, len(closes)):
        if closes[i - 1] > 0 and closes[i] > 0:
            log_ret[i] = log(closes[i] / closes[i - 1])
        else:
            log_ret[i] = None

    # EMA50, EMA200
    ema50 = ema(closes, 50)
    ema200 = ema(closes, 200)

    # vol pe 30 de zile, anualizat *100 (ca %)
    std30 = rolling_std(log_ret, 30)
    vol30 = [
        None if s is None else s * sqrt(365.0) * 100.0
        for s in std30
    ]

    dir_window = 20
    last_struct = None
    last_dir = None
    last_price = None
    last_date = None

    for i in range(len(closes)):
        # replicăm condițiile din HTML:
        if i < 200 or i < 30 or i < dir_window + 200:
            continue

        short = ema50[i]
        long = ema200[i]
        vol_now = vol30[i]

        if short is None or long is None or vol_now is None:
            continue

        # IC_BTC structural
        trend_diff = short - long
        trend_strength = (abs(trend_diff) / max(long, 1e-8)) * 100.0
        vol_now = max(vol_now, 1e-6)
        struct_score = clamp(50.0 + (trend_strength - vol_now) * 0.6, 0.0, 100.0)

        # ICD_BTC direcțional
        trend_dir = 0.0
        if trend_diff > 0:
            trend_dir = 1.0
        elif trend_diff < 0:
            trend_dir = -1.0
        else:
            j = max(0, i - 5)
            diff50 = (ema50[i] or 0.0) - (ema50[j] or 0.0)
            if diff50 > 0:
                trend_dir = 1.0
            elif diff50 < 0:
                trend_dir = -1.0
            else:
                trend_dir = 1.0  # fallback

        match = 0
        total = 0
        for j in range(i - dir_window + 1, i + 1):
            if j < 0 or j >= len(log_ret):
                continue
            r = log_ret[j]
            if not r:
                continue
            total += 1
            if (r > 0 and trend_dir > 0) or (r < 0 and trend_dir < 0):
                match += 1

        align = (match / total) if total > 0 else 0.5
        dir_score = clamp(align * 100.0, 0.0, 100.0)

        last_struct = struct_score
        last_dir = dir_score
        last_price = closes[i]
        last_date = candles[i]["dt"]

    if last_struct is None or last_dir is None or last_date is None:
        raise RuntimeError("Nu s-a putut calcula niciun punct valid pentru IC_BTC/ICD_BTC.")

    state = {
        "date": last_date.strftime("%Y-%m-%d"),
        "ic_btc": round(last_struct, 2),
        "icd_btc": round(last_dir, 2),
        "price": round(last_price, 2),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    print("✅ btc_state_latest.json generat din btc_ohlc.json:")
    print(json.dumps(state, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
