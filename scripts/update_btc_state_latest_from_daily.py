import json
from math import log, sqrt, tanh
from pathlib import Path
from datetime import datetime


# ---------- Căi fișiere ----------

ROOT = Path(__file__).resolve().parent.parent
DATA_BTC = ROOT / "data"

INPUT_FILE = DATA_BTC / "btc_ohlc.json"
OUTPUT_FILE = DATA_BTC / "btc_state_latest.json"


# ---------- Funcții utilitare ----------

def parse_date(s: str) -> datetime:
    """
    Încearcă mai multe formate de dată.
    Acceptă:
      - 'YYYY-MM-DD'
      - 'YYYY-MM-DDTHH:MM:SS'
      - 'YYYY-MM-DDTHH:MM:SSZ'
      - timestamp în milisecunde (string / număr)
    """
    if s is None:
        raise ValueError("dată lipsă")

    # dacă arată ca numeric (ex. 1708387200000)
    try:
        if isinstance(s, (int, float)):
            return datetime.utcfromtimestamp(float(s) / 1000.0)
        # string numeric lung => probabil ms
        if isinstance(s, str) and s.isdigit() and len(s) >= 10:
            return datetime.utcfromtimestamp(float(s) / 1000.0)
    except Exception:
        pass

    if not isinstance(s, str):
        s = str(s)

    fmts = [
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
    ]
    last_err = None
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt)
        except ValueError as e:
            last_err = e
            continue
    raise last_err or ValueError(f"Nu pot parsa data: {s}")


def ema(series, window: int):
    """
    EMA simplă, ignoră valorile None la început.
    """
    k = 2.0 / (window + 1.0)
    out = [None] * len(series)
    ema_val = None
    for i, x in enumerate(series):
        if x is None:
            out[i] = None
            continue
        if ema_val is None:
            ema_val = float(x)
        else:
            ema_val = k * float(x) + (1.0 - k) * ema_val
        out[i] = ema_val
    return out


def rolling_std(series, window: int):
    """
    Deviație standard rulantă (simplă, ne-optimizată).
    Folosește doar valori non-None.
    """
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
    """
    Normalizează o serie numerică la [floor, ceil], ignorând None.
    """
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


# ---------- Main logic ----------

def main():
    # 1) Încarcă btc_ohlc.json
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Lipsește fișierul: {INPUT_FILE}")

    with INPUT_FILE.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    # 2) Transformăm în candles cu dt + close
    candles = []

    for row in raw:
    # 1️⃣ întâi încercăm timestamp (milisecunde Unix)
       ts = row.get("timestamp")
       if ts is not None:
          try:
            dt = datetime.utcfromtimestamp(int(ts) / 1000)
          except (ValueError, OSError):
            continue
       else:
        # 2️⃣ fallback: încearcă time/date/t ca text
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

    # 3) Sortăm după dată
    candles.sort(key=lambda c: c["dt"])
    closes = [c["close"] for c in candles]

    # 4) Log-return-uri zilnice
    log_ret = [None] * len(closes)
    for i in range(1, len(closes)):
        if closes[i - 1] > 0 and closes[i] > 0:
            log_ret[i] = log(closes[i] / closes[i - 1])
        else:
            log_ret[i] = None

    # 5) EMA50 / EMA200 pe preț
    ema50 = ema(closes, 50)
    ema200 = ema(closes, 200)

    # 6) Volatilitate 30 zile, anualizată (%)
    std30 = rolling_std(log_ret, 30)
    vol30 = [
        None if s is None else s * sqrt(365.0) * 100.0
        for s in std30
    ]

    # 7) IC structural – "cât de ordonat / trenduit" e prețul
    #    - diferență dintre EMA50 și EMA200
    #    - cum stă prețul față de EMA-uri
    struct_raw = []
    for i in range(len(closes)):
        p = closes[i]
        e50 = ema50[i]
        e200 = ema200[i]
        if p is None or e50 is None or e200 is None:
            struct_raw.append(None)
            continue
        # măsură simplă de trend + structură
        slope = e50 - e200
        dist = (p - e50) / e50 if e50 != 0 else 0.0
        struct_raw.append(abs(slope) + abs(dist) * 0.5)

    ic_struct = min_max_norm(struct_raw, 0.0, 100.0)

    # 8) IC direcțional – "cât de coerentă" e direcția
    #    - log-return-uri netezite
    #    - semn + magnitudine
    smooth_ret = ema(log_ret, 10)
    dir_raw = []
    for r in smooth_ret:
        if r is None:
            dir_raw.append(None)
        else:
            # tanh pentru a comprima extremele
            dir_raw.append(tanh(r * 20.0))

    # mapăm [-1, 1] -> [0, 100]
    ic_dir = []
    for x in dir_raw:
        if x is None:
            ic_dir.append(None)
        else:
            ic_dir.append(50.0 + 50.0 * x)

    # 9) Selectăm ultima zi pentru state-ul "latest"
    last = candles[-1]
    last_dt = last["dt"]
    last_close = last["close"]
    last_ic_struct = ic_struct[-1]
    last_ic_dir = ic_dir[-1]

    state = {
        "last_date": last_dt.strftime("%Y-%m-%d"),
        "last_close": last_close,
        "ic_struct": last_ic_struct,
        "ic_dir": last_ic_dir,
        "n_points": len(candles),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print(f"✅ Scris {OUTPUT_FILE} pentru data {state['last_date']}")


if __name__ == "__main__":
    main()
