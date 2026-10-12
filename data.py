"""Descarga y cachea datos de football-data.co.uk (resultados, cuotas y próximos partidos)."""
import io
import time
from pathlib import Path

import pandas as pd
import requests

BASE = "https://www.football-data.co.uk"
CACHE = Path(__file__).parent / "cache"
CACHE.mkdir(exist_ok=True)
LIGAS = {
    "E0": "Premier League", "SP1": "La Liga", "D1": "Bundesliga",
    "I1": "Serie A", "F1": "Ligue 1", "N1": "Eredivisie", "P1": "Primeira Liga",
    "PER": "Liga 1 Perú",
}


def _get(url: str, name: str, max_age_h: float) -> str:
    f = CACHE / name
    if f.exists() and (time.time() - f.stat().st_mtime) < max_age_h * 3600:
        return f.read_text(encoding="utf-8")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    f.write_text(r.content.decode("utf-8-sig", errors="replace"), encoding="utf-8")
    return f.read_text(encoding="utf-8")


def _parse(txt: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(txt), on_bad_lines="skip")
    df = df.dropna(subset=["HomeTeam", "AwayTeam"])
    df["Date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
    return df.dropna(subset=["Date"])


def temporadas_default(n: int = 3):
    """Códigos de temporada (p.ej. '2627') de la actual hacia atrás; la temporada cambia en julio."""
    hoy = pd.Timestamp.today()
    y = hoy.year if hoy.month >= 7 else hoy.year - 1
    return tuple(f"{(y - k) % 100:02d}{(y - k + 1) % 100:02d}" for k in range(n))


def historico(div: str, temporadas=None) -> pd.DataFrame:
    temporadas = temporadas or temporadas_default()
    frames = []
    for t in temporadas:
        try:
            # temporada en curso: refrescar cada 6h; las cerradas, cada 30 días
            age = 6 if t == temporadas[0] else 720
            frames.append(_parse(_get(f"{BASE}/mmz4281/{t}/{div}.csv", f"{div}_{t}.csv", age)))
        except Exception as e:  # temporada inexistente o sin datos aún
            print(f"  aviso: {div} {t}: {e}")
    df = pd.concat(frames, ignore_index=True)
    df = df.dropna(subset=["FTHG", "FTAG"])
    df[["FTHG", "FTAG"]] = df[["FTHG", "FTAG"]].astype(int)
    return df.sort_values("Date").reset_index(drop=True)


def proximos(div: str) -> pd.DataFrame:
    df = _parse(_get(f"{BASE}/fixtures.csv", "fixtures.csv", 3))
    return df[df["Div"] == div].reset_index(drop=True)
