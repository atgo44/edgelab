"""Validación walk-forward: ¿el modelo (y la mezcla) realmente compite con el mercado?
Uso: python backtest.py [--liga E0] [--n 200]"""
import argparse
import sys

import numpy as np
import pandas as pd

import data
from model import DixonColes

sys.stdout.reconfigure(encoding="utf-8")


def run(liga="E0", n=200, paso=14):
    """Devuelve {'n': partidos, 'logloss': {peso_mercado: log-loss}} o None."""
    df = data.historico(liga)
    ocol = ["AvgCH", "AvgCD", "AvgCA"] if "AvgCH" in df else ["AvgH", "AvgD", "AvgA"]
    df = df.dropna(subset=ocol).reset_index(drop=True)
    test = df.tail(n)
    filas = []
    for ini in pd.date_range(test.Date.min(), test.Date.max(), freq=f"{paso}D"):
        bloque = test[(test.Date >= ini) & (test.Date < ini + pd.Timedelta(days=paso))]
        if bloque.empty:
            continue
        previo = df[df.Date < ini]
        m = DixonColes().fit(previo, fecha_ref=previo.Date.max())
        for _, r in bloque.iterrows():
            if not m.conoce(r.HomeTeam, r.AwayTeam):
                continue
            pm = m.mercados(r.HomeTeam, r.AwayTeam)
            inv = 1 / np.array([r[c] for c in ocol], dtype=float)
            filas.append((np.array([pm["1"], pm["X"], pm["2"]]), inv / inv.sum(),
                          {"H": 0, "D": 1, "A": 2}[r.FTR]))
    if not filas:
        return None
    return {"n": len(filas), "logloss": {
        w: float(np.mean([-np.log(max(((1 - w) * p + w * mk)[r], 1e-9)) for p, mk, r in filas]))
        for w in (0.0, 0.25, 0.5, 0.75, 1.0)}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--liga", default="E0")
    ap.add_argument("--n", type=int, default=200, help="últimos N partidos a evaluar")
    ap.add_argument("--paso", type=int, default=14, help="días entre re-entrenamientos")
    a = ap.parse_args()
    r = run(a.liga, a.n, a.paso)
    if not r:
        print("Sin datos suficientes.")
        return
    print(f"Partidos evaluados: {r['n']}  (liga {a.liga})")
    for w, v in r["logloss"].items():
        tag = "  <- solo modelo" if w == 0 else "  <- solo mercado" if w == 1 else ""
        print(f"  peso mercado {w:.2f}  log-loss={v:.4f}{tag}")
    print("Menor log-loss = mejor. Si 'solo modelo' no supera a 'solo mercado', la ventaja\n"
          "viene de la mezcla o no existe: usar con cautela.")


if __name__ == "__main__":
    main()
