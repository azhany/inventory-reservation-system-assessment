#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_project_name=${COMPOSE_PROJECT_NAME:-inventory-reservation-development-validation}

export PORT=${VALIDATION_API_PORT:-31300}
export POSTGRES_PORT=${VALIDATION_POSTGRES_PORT:-35432}

compose() {
  docker compose \
    --project-name "$compose_project_name" \
    --file "$repository_root/compose.yaml" \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans
}

trap cleanup EXIT HUP INT TERM

compose up --build --detach --wait
compose run --rm migrate
compose exec --no-TTY api node -e \
  "Promise.all(['/health/live', '/health/ready'].map(async (path) => { const response = await fetch('http://127.0.0.1:3000' + path); if (!response.ok) process.exit(1); }))"
