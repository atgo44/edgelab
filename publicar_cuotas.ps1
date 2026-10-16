# Lee las cuotas de Betano (necesita IP de Perú) y las publica en la rama "odds-data" del repositorio.
# La rama se reescribe en cada ejecución (un solo commit): no crece el historial ni lanza otra publicación.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot "..\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py cuotas_pe.py | Out-Null
$f = Join-Path $PSScriptRoot "odds\peru_odds.json"
if (-not (Test-Path $f)) { exit 0 }
$tmp = Join-Path $env:TEMP "edgelab-odds"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item $f (Join-Path $tmp "peru_odds.json")
Set-Location $tmp
git init -q -b odds-data
git config user.name "EdgeLab"
git config user.email "edgelab@users.noreply.github.com"
git add peru_odds.json
git commit -q -m "cuotas Betano"
git push -q --force https://github.com/atgo44/edgelab.git odds-data
