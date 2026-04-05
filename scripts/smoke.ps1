# Static smoke checks (no Node required). Run from repo root: npm run smoke
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Assert-FileContains([string]$Path, [string]$Pattern, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "Missing file: $Path" }
  $c = Get-Content -Raw -LiteralPath $Path
  if ($c -notmatch $Pattern) { throw "Smoke fail ($Label): pattern not found in $Path" }
}

Assert-FileContains "api\index.js" '"marketing-esps"' "handler key"
Assert-FileContains "api\index.js" "push_subscribers" "ESP actions"
Assert-FileContains "index.html" 'id="espTestBtn"' "ESP UI"
Assert-FileContains "index.html" "/api/marketing-esps" "ESP fetch URL"
Assert-FileContains "vercel.json" '/api/\(\.\*\)' "Vercel rewrite"

Write-Host "Smoke OK: api route, index wiring, vercel.json"
