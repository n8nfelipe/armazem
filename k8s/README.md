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

O agente permanece local por padrão. Para habilitar o provedor OpenAI, defina `AGENT_PROVIDER: openai` no Deployment da API, preencha `OPENAI_API_KEY` no Secret e ajuste `OPENAI_MODEL` conforme o modelo disponível na sua conta. A chave é consumida somente pela API; nunca a inclua na interface web.

```bash
kubectl apply -k k8s/
kubectl -n armazem rollout status statefulset/postgres
kubectl -n armazem rollout status deployment/armazem-api
kubectl -n armazem rollout status deployment/armazem-web
```

## Acesso local pelo Ingress

O cluster kind deste ambiente expõe o controller NGINX na porta NodePort `30558`. Adicione o DNS local:

```bash
echo "127.0.0.1 armazem.local" | sudo tee -a /etc/hosts
```

Abra `http://armazem.local:30558`. A interface usará a API em `/api`.

Em clusters kind onde o NodePort não é publicado diretamente no host, use um encaminhamento do controller:

```bash
kubectl -n ingress-nginx port-forward service/ingress-nginx-controller 18080:80
```

Nesse caso, abra `http://armazem.localhost:18080` (não exige alteração no `/etc/hosts`) ou `http://armazem.local:18080`.

### Subir automaticamente no login

Para manter o encaminhamento ativo e reiniciá-lo automaticamente:

```bash
mkdir -p ~/.config/systemd/user
cp k8s/armazem-ingress-port-forward.service ~/.config/systemd/user/
chmod +x scripts/start-ingress-port-forward.sh
systemctl --user daemon-reload
systemctl --user enable --now armazem-ingress-port-forward.service
systemctl --user status armazem-ingress-port-forward.service
```

O serviço usa o contexto `kind-rancher` e a porta local `18080`. Para alterar, edite as variáveis `KUBE_CONTEXT` e `INGRESS_LOCAL_PORT` na unidade.

Em clusters com o Ingress exposto diretamente na porta 80, use `http://armazem.local` sem a porta `30558`.

## Registry

Para publicar em um registry, substitua as imagens em `api.yaml` e `web.yaml` por referências como `ghcr.io/ORG/armazem-api:TAG` e `ghcr.io/ORG/armazem-web:TAG`, remova `imagePullPolicy: IfNotPresent` se desejar a política padrão do registry e configure `imagePullSecrets` quando necessário.

O PostgreSQL está configurado com uma única réplica e PVC de 5 GiB para desenvolvimento e operação inicial. Faça backup e use uma oferta gerenciada ou StatefulSet endurecido antes de produção crítica.
