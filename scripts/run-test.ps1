$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = Join-Path $root ".tools\node\node.exe"
$script = Join-Path $root "scripts\test-api.mjs"
if (-not (Test-Path $node)) {
  Write-Error "Missing portable Node at $node. Run: npm run setup-node"
}
& $node $script
exit $LASTEXITCODE
