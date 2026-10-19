# Stop and remove the FinAlly container. The finally-data volume is kept.
$ErrorActionPreference = 'Stop'

$Container = 'finally'

$exists = docker ps -aq -f "name=^$Container$"
if ($exists) {
    docker rm -f $Container *> $null
    Write-Host "FinAlly stopped. Data volume 'finally-data' preserved."
} else {
    Write-Host 'FinAlly is not running.'
}
