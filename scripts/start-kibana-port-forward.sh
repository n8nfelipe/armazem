#!/usr/bin/env bash
set -euo pipefail

exec kubectl --context kind-raiz-comum \
  -n elastic-stack \
  port-forward --address 127.0.0.1 \
  service/raiz-comum-kb-http 15601:5601
