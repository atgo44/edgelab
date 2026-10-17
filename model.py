"""Modelo Dixon-Coles (Poisson bivariante con corrección de marcadores bajos y decaimiento temporal)."""
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import nbinom, poisson

G = 10  # goles máximos considerados por equipo


def _tau(x, y, lam, mu, rho):
    t = np.ones_like(lam)
    t = np.where((x == 0) & (y == 0), 1 - lam * mu * rho, t)
    t = np.where((x == 0) & (y == 1), 1 + lam * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + mu * rho, t)
    t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return np.clip(t, 1e-6, None)


class DixonColes:
    def __init__(self, vida_media_dias: float = 365, reg: float = 0.5, xg_peso: float = 0.0):
        self.xi = np.log(2) / vida_media_dias
        self.reg = reg
        self.xg_peso = xg_peso  # 0 = solo goles; 0.5 = mitad goles, mitad xG (donde haya xG)

    def fit(self, df: pd.DataFrame, fecha_ref=None):
        fecha_ref = fecha_ref or df["Date"].max()
        df = df[df["Date"] <= fecha_ref]
        self.teams = sorted(set(df.HomeTeam) | set(df.AwayTeam))
        ix = {t: i for i, t in enumerate(self.teams)}
        n = len(self.teams)
        hi = df.HomeTeam.map(ix).to_numpy()
        ai = df.AwayTeam.map(ix).to_numpy()
        hg = df.FTHG.to_numpy()
        ag = df.FTAG.to_numpy()
        # objetivo del término Poisson: goles, o mezcla goles/xG cuando el partido tiene xG
        yh, ya = hg.astype(float), ag.astype(float)
        if self.xg_peso > 0 and "HxG" in df and "AxG" in df:
            xh, xa = df["HxG"].to_numpy(float), df["AxG"].to_numpy(float)
            ok = ~np.isnan(xh) & ~np.isnan(xa)
            yh = np.where(ok, (1 - self.xg_peso) * yh + self.xg_peso * xh, yh)
            ya = np.where(ok, (1 - self.xg_peso) * ya + self.xg_peso * xa, ya)
        w = np.exp(-self.xi * (fecha_ref - df.Date).dt.days.to_numpy())

        def nll(th):
            att = th[:n] - th[:n].mean()
            dfn = th[n:2 * n]
            lam = np.exp(att[hi] + dfn[ai] + th[2 * n])
            mu = np.exp(att[ai] + dfn[hi])
            ll = (yh * np.log(lam) - lam - gammaln(yh + 1)
                  + ya * np.log(mu) - mu - gammaln(ya + 1)
                  + np.log(_tau(hg, ag, lam, mu, th[2 * n + 1])))  # la corrección de marcadores bajos usa los goles reales
            return -(w * ll).sum() + self.reg * (att @ att + dfn @ dfn)

        x0 = np.zeros(2 * n + 2)
        x0[2 * n] = 0.25
        bounds = [(None, None)] * (2 * n + 1) + [(-0.3, 0.3)]
        th = minimize(nll, x0, method="L-BFGS-B", bounds=bounds).x
        self.att = dict(zip(self.teams, th[:n] - th[:n].mean()))
        self.dfn = dict(zip(self.teams, th[n:2 * n]))
        self.home, self.rho = th[2 * n], th[2 * n + 1]
        return self

    def conoce(self, *equipos):
        return all(e in self.att for e in equipos)

    def matriz(self, local: str, visita: str) -> np.ndarray:
        lam = float(np.clip(np.exp(self.att[local] + self.dfn[visita] + self.home), 0.2, 3.5))
        mu = float(np.clip(np.exp(self.att[visita] + self.dfn[local]), 0.2, 3.5))
        k = np.arange(G)
        pl = np.exp(k * np.log(lam) - lam - gammaln(k + 1))
        pv = np.exp(k * np.log(mu) - mu - gammaln(k + 1))
        m = np.outer(pl, pv)
        m[0, 0] *= max(1 - lam * mu * self.rho, 1e-6)
        m[0, 1] *= 1 + lam * self.rho
        m[1, 0] *= 1 + mu * self.rho
        m[1, 1] *= 1 - self.rho
        return m / m.sum()

    def mercados(self, local: str, visita: str) -> dict:
        m = self.matriz(local, visita)
        i, j = np.indices(m.shape)
        return {
            "1": m[i > j].sum(), "X": m[i == j].sum(), "2": m[i < j].sum(),
            "O2.5": m[i + j >= 3].sum(), "U2.5": m[i + j <= 2].sum(),
            "BTTS_SI": m[(i > 0) & (j > 0)].sum(), "BTTS_NO": m[(i == 0) | (j == 0)].sum(),
        }


class CountModel:
    """Poisson de conteo por equipo (ataque/defensa/localía) para una variable cualquiera
    (goles 1T, córners, tarjetas, tiros...). El total usa Binomial Negativa si hay sobredispersión."""

    def __init__(self, vida_media_dias: float = 365, reg: float = 0.5):
        self.xi = np.log(2) / vida_media_dias
        self.reg = reg

    def fit(self, df: pd.DataFrame, hcol: str, acol: str, fecha_ref=None):
        df = df.dropna(subset=[hcol, acol])
        if len(df) < 60:
            raise ValueError("pocos datos")
        fecha_ref = fecha_ref or df["Date"].max()
        self.teams = sorted(set(df.HomeTeam) | set(df.AwayTeam))
        ix = {t: i for i, t in enumerate(self.teams)}
        n = len(self.teams)
        hi, ai = df.HomeTeam.map(ix).to_numpy(), df.AwayTeam.map(ix).to_numpy()
        y1, y2 = df[hcol].to_numpy(float), df[acol].to_numpy(float)
        w = np.exp(-self.xi * (fecha_ref - df.Date).dt.days.to_numpy())

        def nll(th):
            att = th[:n] - th[:n].mean()
            dfn = th[n:2 * n]
            lam = np.exp(att[hi] + dfn[ai] + th[2 * n])
            mu = np.exp(att[ai] + dfn[hi])
            ll = y1 * np.log(lam) - lam + y2 * np.log(mu) - mu
            return -(w * ll).sum() + self.reg * (att @ att + dfn @ dfn)

        x0 = np.zeros(2 * n + 1)
        x0[2 * n] = 0.1
        th = minimize(nll, x0, method="L-BFGS-B").x
        self.att = dict(zip(self.teams, th[:n] - th[:n].mean()))
        self.dfn = dict(zip(self.teams, th[n:2 * n]))
        self.home = th[2 * n]
        self.avg = float((w * (y1 + y2)).sum() / (2 * w.sum()))   # media por equipo y partido
        # sobredispersión del total: Var = m + m^2/r
        m = np.exp(th[:n][hi] - th[:n].mean() + th[n:2 * n][ai] + self.home) + \
            np.exp(th[:n][ai] - th[:n].mean() + th[n:2 * n][hi])
        yt = y1 + y2
        den = ((yt - m) ** 2 - m).sum()
        self.r = float(np.clip((m ** 2).sum() / den, 3, 1000)) if den > 0 else 1000.0
        return self

    def conoce(self, *eq):
        return all(e in self.att for e in eq)

    def medias(self, local, visita):
        lam = float(np.exp(self.att[local] + self.dfn[visita] + self.home))
        mu = float(np.exp(self.att[visita] + self.dfn[local]))
        lo, hi = 0.4 * self.avg, 2.0 * self.avg          # evita extrapolar con pocos partidos
        return float(np.clip(lam, lo, hi)), float(np.clip(mu, lo, hi))

    def p_over(self, mean: float, linea: float) -> float:
        k = int(np.floor(linea))
        if self.r >= 999:
            return float(poisson.sf(k, mean))
        return float(nbinom.sf(k, self.r, self.r / (self.r + mean)))

    def lineas(self, mean: float, n=3):
        base = int(np.floor(mean))
        ls = [base - 0.5 + i for i in range(n) if base - 0.5 + i > 0]
        return [{"l": l, "o": round(self.p_over(mean, l), 4)} for l in ls]
