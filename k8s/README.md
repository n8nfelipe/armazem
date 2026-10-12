# Armazém no Kubernetes

Os manifestos desta pasta sobem PostgreSQL com volume persistente, API FastAPI e web Next.js. As imagens locais esperadas são `armazem-api:local` e `armazem-web:local`.

## Imagens e instalação

```bash
docker build -t armazem-api:local ./backend
docker build -t armazem-web:local ./frontend
```

Para kind:

```bash
kind load docker-image armazem-api:local armazem-web:local
```

Para minikube:

```bash
minikube image load armazem-api:local
minikube image load armazem-web:local
```

Antes de um ambiente compartilhado, edite `secret.yaml` ou substitua-o por um Secret gerenciado pelo seu cluster. Os valores versionados são apenas placeholders locais.

```bash
kubectl apply -k k8s/
kubectl -n armazem rollout status statefulset/postgres
kubectl -n armazem rollout status deployment/armazem-api
kubectl -n armazem rollout status deployment/armazem-web
```

## Acesso local

Em dois terminais:

```bash
kubectl -n armazem port-forward service/armazem-api 8000:8000
kubectl -n armazem port-forward service/armazem-web 3000:3000
```

Abra `http://localhost:3000`. O navegador usará a API em `http://localhost:8000`, conforme `NEXT_PUBLIC_API_URL`.

## Registry

Para publicar em um registry, substitua as imagens em `api.yaml` e `web.yaml` por referências como `ghcr.io/ORG/armazem-api:TAG` e `ghcr.io/ORG/armazem-web:TAG`, remova `imagePullPolicy: IfNotPresent` se desejar a política padrão do registry e configure `imagePullSecrets` quando necessário.

O PostgreSQL está configurado com uma única réplica e PVC de 5 GiB para desenvolvimento e operação inicial. Faça backup e use uma oferta gerenciada ou StatefulSet endurecido antes de produção crítica.
