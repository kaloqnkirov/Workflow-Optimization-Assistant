# Downloads portable Node.js LTS into .tools/node (Windows x64). Safe to re-run.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dest = Join-Path $root ".tools"
$targetExe = Join-Path $dest "node\node.exe"
if (Test-Path $targetExe) {
  Write-Host "Node already present:" (Get-Item $targetExe).FullName
  & $targetExe --version
  exit 0
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$json = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
$pick = $json | Where-Object { $_.lts -ne $false -and $null -ne $_.lts } | Where-Object { "win-x64-zip" -in $_.files } | Select-Object -First 1
$ver = $pick.version
$zipName = "node-$ver-win-x64.zip"
$zip = Join-Path $dest $zipName
$extractName = "node-$ver-win-x64"
Write-Host "Downloading $ver..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$zipName" -OutFile $zip -UseBasicParsing
Write-Host "Extracting..."
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
Remove-Item $zip -Force
$extracted = Join-Path $dest $extractName
$final = Join-Path $dest "node"
if (Test-Path $final) { Remove-Item $final -Recurse -Force }
Move-Item $extracted $final
Write-Host "Done:" (Join-Path $final "node.exe")
& (Join-Path $final "node.exe") --version
