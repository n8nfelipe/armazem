#!/usr/bin/env bash
set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-kind-rancher}"
LOCAL_PORT="${INGRESS_LOCAL_PORT:-18080}"

exec kubectl --context "${KUBE_CONTEXT}" -n ingress-nginx \
  port-forward --address 127.0.0.1 \
  "service/ingress-nginx-controller" "${LOCAL_PORT}:80"
