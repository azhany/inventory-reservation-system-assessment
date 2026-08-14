#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_project_name=${COMPOSE_PROJECT_NAME:-inventory-reservation-production-validation}

compose() {
  docker compose \
    --project-name "$compose_project_name" \
    --file "$repository_root/compose.test.yaml" \
    --profile production-validation \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans
}

trap cleanup EXIT HUP INT TERM

compose build production-api
compose up --detach --wait test-database
compose run --rm production-api node apps/api/dist/db/migrate-cli.js
compose up --detach --wait production-api

container_id=$(compose ps --quiet production-api)
runtime_user=$(docker inspect --format '{{.Config.User}}' "$container_id")

if [ "$runtime_user" != 'node' ]; then
  echo "Expected production image user 'node', found '$runtime_user'." >&2
  exit 1
fi
