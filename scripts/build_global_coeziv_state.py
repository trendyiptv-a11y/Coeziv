import json
from pathlib import Path
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# INPUT: seria globală IC (ajustează numele dacă la tine e altul)
GLOBAL_SERIES_FILE = DATA_DIR / "global_ic_series.json"

# OUTPUT: fișierul consumat de ic_global.html
GLOBAL_STATE_FILE = DATA_DIR / "global_coeziv_state.json"


# Praguri oficiale ale modelului pentru IC / ICD.
# Dacă ai alte valori „canonice” în model, modifică-le aici,
# NU în frontend.
IC_LOW = 35.0
IC_HIGH = 65.0
ICD_LOW = 40.0
ICD_HIGH = 60.0


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def safe_float(v):
    try:
        if v is None:
            return None
        return float(v)
    except Exception:
        return None


def load_global_series(path: Path):
    """
    Citește seria globală de IC din JSON.
    Așteaptă un JSON de forma:
    {
      "series": [
        { "t": 1731888000000, "ic_global": 78.4, "icd_global": 72.1, "regime": "bull" },
        ...
      ]
    }
    """
    if not path.exists():
        raise RuntimeError(f"Lipsă fișier serie globală: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    series = data.get("series") or []
    if not isinstance(series, list) or not series:
        raise RuntimeError("Seria globală este goală sau invalidă")

    # Normalizăm câmpurile de interes
    norm = []
    for row in series:
        t = row.get("t")
        ic = safe_float(row.get("ic_global") or row.get("ic"))
        icd = safe_float(row.get("icd_global") or row.get("icd"))
        regime = (row.get("regime") or "neutral").lower()

        if t is None:
            # Ignorăm rândurile fără timestamp
            continue

        norm.append(
            {
                "t": int(t),
                "ic_global": ic,
                "icd_global": icd,
                "regime": regime,
            }
        )

    if not norm:
        raise RuntimeError("Nu există rânduri valide în seria globală IC")

    return norm


def classify_level(value: float, low: float, high: float):
    """
    Întoarce (nivel, mod) pentru indicatori 0–100.
    nivel: 'scăzut' / 'mediu' / 'ridicat' / 'necunoscut'
    mod:   'bull' / 'bear' / 'neutral'
    """
    if value is None:
        return "necunoscut", "neutral"

    if value <= low:
        return "scăzut", "bear"
    if value >= high:
        return "ridicat", "bull"
    return "mediu", "neutral"


def build_ic_text(level: str, mode: str) -> str:
    """
    Text interpretativ pentru IC Global.
    """
    if level == "necunoscut":
        return "Indice structural global (IC Global). Date insuficiente pentru o interpretare robustă."

    if level == "scăzut":
        return (
            "Structură globală slăbită sau fragmentată. Piața agregată este mai puțin coerentă, "
            "cu mesaje mixte între clasele de active."
        )
    if level == "mediu":
        return (
            "Structură globală moderată. Contextul nu este extrem, dar nici complet dezancorat: "
            "există coerență, fără a fi o fază de forțare structurală."
        )
    # ridicat
    return (
        "Structură globală coerentă și bine definită. Fluxurile majore sunt aliniate, iar piețele tind "
        "să reacționeze în mod sincronizat la șocuri și informație."
    )


def build_icd_text(level: str, mode: str) -> str:
    """
    Text interpretativ pentru ICD Global.
    """
    if level == "necunoscut":
        return "Indice direcțional global (ICD Global). Date insuficiente pentru o interpretare robustă."

    if level == "scăzut":
        return (
            "Direcționalitate slabă sau defensivă. Mediul global este mai degrabă defensiv sau orientat spre "
            "protecție, cu apetit redus pentru risc."
        )
    if level == "mediu":
        return (
            "Direcționalitate moderată. Piața nu este nici clar pro-risc, nici clar defensivă, sugerând o "
            "fază de tranziție sau recalibrare."
        )
    # ridicat
    return (
        "Direcționalitate ridicată, orientată spre risc. Mediul global este în mod clar pro-risc (risk-on), "
        "cu fluxuri favorabile activelor ciclice și de creștere."
    )


def build_regime_label_and_text(regime: str, ic_level: str, icd_level: str) -> tuple[str, str]:
    """
    Construiește eticheta și descrierea regimului global pe baza codului de regim și a nivelurilor IC/ICD.
    """
    regime = (regime or "neutral").lower()

    if regime == "bull":
        label = "Regim coeziv bullish global"
        text = (
            "Structură solidă și fluxuri pro-risc în principalele active globale. "
            "Mediul favorizează, în general, asumarea de risc și expunerea pe active ciclice."
        )
        return label, text

    if regime == "bear":
        label = "Regim coeziv bearish global"
        text = (
            "Structură globală tensionată sau defensivă, cu fluxuri orientate spre protecție și reducere de risc. "
            "Mediul favorizează activele defensive și strategiile de conservare a capitalului."
        )
        return label, text

    # neutral / transition
    label = "Regim coeziv neutru / de tranziție"
    text = (
        "Context global aflat într-o fază de tranziție: nici clar pro-risc, nici clar defensiv. "
        "Structura și direcționalitatea sunt mixte, iar schimbările de regim pot apărea mai ușor."
    )
    return label, text


def build_simple_summary_title(regime: str, ic_level: str, icd_level: str) -> str:
    """
    Titlu scurt pentru rezumatul simplificat, orientat pe utilizator.
    """
    regime = (regime or "neutral").lower()

    if regime == "bull":
        if ic_level == "ridicat" and icd_level == "ridicat":
            return "Context global pozitiv, matur și stabil"
        return "Context global pozitiv, cu bias pro-risc"

    if regime == "bear":
        if ic_level == "ridicat":
            return "Context defensiv, cu structură tensionată"
        return "Context global fragil sau defensiv"

    # neutral
    return "Context global de tranziție, fără extremă clară"


def build_simple_summary_lines(ic_level: str, icd_level: str) -> list[str]:
    """
    Două linii simple pentru user, legate de IC și ICD.
    """
    lines = []

    # IC
    if ic_level == "ridicat":
        lines.append("IC Global în zonă ridicată – structură agregată puternică.")
    elif ic_level == "mediu":
        lines.append("IC Global în zonă medie – structură moderată, fără extreme.")
    elif ic_level == "scăzut":
        lines.append("IC Global în zonă joasă – structură fragmentată sau instabilă.")
    else:
        lines.append("IC Global – date insuficiente pentru o concluzie clară.")

    # ICD
    if icd_level == "ridicat":
        lines.append("ICD Global în zonă ridicată – direcționalitate orientată spre risc.")
    elif icd_level == "mediu":
        lines.append("ICD Global în zonă medie – bias global echilibrat, fără extremă clară.")
    elif icd_level == "scăzut":
        lines.append("ICD Global în zonă joasă – bias defensiv sau apetit redus pentru risc.")
    else:
        lines.append("ICD Global – date insuficiente pentru o concluzie clară.")

    return lines


def main():
    series = load_global_series(GLOBAL_SERIES_FILE)
    series_sorted = sorted(series, key=lambda r: r["t"])
    current = series_sorted[-1]

    ic_val = safe_float(current["ic_global"])
    icd_val = safe_float(current["icd_global"])
    regime_code = (current.get("regime") or "neutral").lower()

    ic_level, ic_mode = classify_level(ic_val, IC_LOW, IC_HIGH)
    icd_level, icd_mode = classify_level(icd_val, ICD_LOW, ICD_HIGH)

    ic_text = build_ic_text(ic_level, ic_mode)
    icd_text = build_icd_text(icd_level, icd_mode)

    regime_label, regime_text = build_regime_label_and_text(
        regime_code, ic_level, icd_level
    )

    simple_title = build_simple_summary_title(regime_code, ic_level, icd_level)
    simple_lines = build_simple_summary_lines(ic_level, icd_level)

    # Structura finală conformă cu ic_global.html
    out = {
      "series": series_sorted,
      "thresholds": {
          "ic_low": IC_LOW,
          "ic_high": IC_HIGH,
          "icd_low": ICD_LOW,
          "icd_high": ICD_HIGH,
      },
      "current": {
          "t": current["t"],
          "ic_global": ic_val,
          "icd_global": icd_val,
          "regime": regime_code,

          "ic_global_level": ic_level,
          "ic_global_mode": ic_mode,
          "ic_global_text": ic_text,

          "icd_global_level": icd_level,
          "icd_global_mode": icd_mode,
          "icd_global_text": icd_text,

          "regime_label": regime_label,
          "regime_text": regime_text,

          "simple_summary_title": simple_title,
          "simple_summary_lines": simple_lines,
      },
    }

    GLOBAL_STATE_FILE.write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] Global Coeziv state salvat în {GLOBAL_STATE_FILE}")


if __name__ == "__main__":
    main()
