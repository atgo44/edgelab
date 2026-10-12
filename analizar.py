"""Uso:  python analizar.py [--ligas E0 SP1 ...] [--dias 7] [--peso-mercado 0.5] [--edge 0.03]"""
import argparse
import sys

import pandas as pd

import data
from engine import combinadas, picks_partido
from model import DixonColes

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ligas", nargs="+", default=["E0", "SP1", "D1", "I1", "F1"])
    ap.add_argument("--dias", type=int, default=7)
    ap.add_argument("--peso-mercado", type=float, default=0.75)
    ap.add_argument("--edge", type=float, default=0.03, help="edge mínimo por selección")
    a = ap.parse_args()

    picks = []
    hoy = pd.Timestamp.today().normalize()
    for div in a.ligas:
        print(f"[{div}] {data.LIGAS.get(div, div)}: entrenando...", flush=True)
        hist = data.historico(div)
        fx = data.proximos(div)
        fx = fx[(fx.Date >= hoy) & (fx.Date <= hoy + pd.Timedelta(days=a.dias))]
        if fx.empty:
            continue
        m = DixonColes().fit(hist)
        for _, r in fx.iterrows():
            if not m.conoce(r.HomeTeam, r.AwayTeam):
                print(f"  sin historial: {r.HomeTeam} / {r.AwayTeam}")
                continue
            picks += picks_partido(r, m, a.peso_mercado)

    if not picks:
        print("No hay partidos con cuotas en la ventana indicada.")
        return
    df = pd.DataFrame(picks)
    val = df[df.edge >= a.edge].sort_values("edge", ascending=False)

    print(f"\n=== PICKS CON VALOR (edge >= {a.edge:.0%}) ===")
    if val.empty:
        print("Ninguno: el mercado no ofrece ventaja clara. No apostar también es una decisión.")
    for r in val.itertuples():
        print(f"{r.fecha:%d/%m} {r.partido:<34} {r.apuesta:<18} p={r.p:.1%} "
              f"(modelo {r.p_modelo:.1%}/mercado {r.p_mercado:.1%}) @{r.cuota:.2f} "
              f"edge={r.edge:+.1%} stake≈{r.stake:.1%} banca")

    cb = combinadas(val.to_dict("records"))
    if cb.empty:
        return
    print("\n=== COMBINADAS MÁS PROBABLES (con valor positivo) ===")
    for r in cb.sort_values("p", ascending=False).head(5).itertuples():
        print(f"p={r.p:.1%} cuota={r.cuota:.2f} edge={r.edge:+.1%} stake≈{r.stake:.1%}")
        for l in r.legs:
            print(f"   - {l}")
    print("\nAviso: probabilidades estimadas, no garantías. Las combinadas multiplican la varianza.")


if __name__ == "__main__":
    main()
