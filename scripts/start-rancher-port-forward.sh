#!/usr/bin/env bash
set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-kind-rancher}"
LOCAL_PORT="${RANCHER_LOCAL_PORT:-18443}"

exec kubectl --context "${KUBE_CONTEXT}" -n cattle-system \
  port-forward --address 127.0.0.1 \
  service/rancher "${LOCAL_PORT}:443"
