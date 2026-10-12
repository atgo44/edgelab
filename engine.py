"""Convierte probabilidades del modelo + cuotas en picks de valor y combinadas."""
from itertools import combinations

import numpy as np
import pandas as pd

# selección -> (columna cuota media, columna mejor cuota, grupo mutuamente excluyente)
SEL = {
    "1": ("AvgH", "MaxH", "1X2"), "X": ("AvgD", "MaxD", "1X2"), "2": ("AvgA", "MaxA", "1X2"),
    "O2.5": ("Avg>2.5", "Max>2.5", "OU"), "U2.5": ("Avg<2.5", "Max<2.5", "OU"),
}
FALLBACK = {"AvgH": "B365H", "MaxH": "B365H", "AvgD": "B365D", "MaxD": "B365D", "AvgA": "B365A",
            "MaxA": "B365A", "Avg>2.5": "B365>2.5", "Max>2.5": "B365>2.5",
            "Avg<2.5": "B365<2.5", "Max<2.5": "B365<2.5"}
NOMBRE = {"1": "Gana local", "X": "Empate", "2": "Gana visitante", "O2.5": "Más de 2.5 goles",
          "U2.5": "Menos de 2.5 goles"}


def _odd(row, col):
    v = row.get(col)
    if pd.isna(v):
        v = row.get(FALLBACK[col])
    return None if pd.isna(v) or v <= 1 else float(v)


def kelly(p, o, frac=0.25, cap=0.03):
    return float(np.clip((p * o - 1) / (o - 1) * frac, 0, cap))


def picks_partido(row, modelo, peso_mercado=0.75):
    """Selecciones con prob. mezclada (modelo + mercado sin margen), cuota y edge."""
    pm = modelo.mercados(row.HomeTeam, row.AwayTeam)
    out = []
    for grupo in ("1X2", "OU"):
        sels = [s for s, v in SEL.items() if v[2] == grupo]
        avg = {s: _odd(row, SEL[s][0]) for s in sels}
        if any(v is None for v in avg.values()):
            continue
        inv = {s: 1 / o for s, o in avg.items()}
        tot = sum(inv.values())  # quita el margen de la casa
        for s in sels:
            p_mkt = inv[s] / tot
            p = (1 - peso_mercado) * pm[s] + peso_mercado * p_mkt
            o = _odd(row, SEL[s][1]) or avg[s]
            out.append(dict(partido=f"{row.HomeTeam} - {row.AwayTeam}", home=row.HomeTeam,
                            away=row.AwayTeam, fecha=row.Date, sel=s,
                            apuesta=NOMBRE[s], p_modelo=pm[s], p_mercado=p_mkt, p=p, cuota=o,
                            edge=p * o - 1, stake=kelly(p, o)))
    return out


def combinadas(picks, tamanos=(2, 3), max_legs=14, min_edge_leg=0.0):
    """Combina picks de partidos distintos (independencia razonable). Prob = producto."""
    base = sorted([p for p in picks if p["edge"] > min_edge_leg], key=lambda p: -p["p"])[:max_legs]
    res = []
    for k in tamanos:
        for c in combinations(base, k):
            if len({x["partido"] for x in c}) < k:
                continue
            p = float(np.prod([x["p"] for x in c]))
            o = float(np.prod([x["cuota"] for x in c]))
            res.append(dict(legs=[f'{x["partido"]}: {x["apuesta"]} @{x["cuota"]:.2f}' for x in c],
                            p=p, cuota=o, edge=p * o - 1, stake=kelly(p, o, cap=0.015)))
    return pd.DataFrame(res)
