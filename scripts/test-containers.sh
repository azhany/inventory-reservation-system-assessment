#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_project_name=${COMPOSE_PROJECT_NAME:-inventory-reservation-test}

cleanup() {
  docker compose \
    --project-name "$compose_project_name" \
    --file "$repository_root/compose.test.yaml" \
    down --volumes --remove-orphans
}

trap cleanup EXIT HUP INT TERM

docker compose \
  --project-name "$compose_project_name" \
  --file "$repository_root/compose.test.yaml" \
  up --build --abort-on-container-exit --exit-code-from test
