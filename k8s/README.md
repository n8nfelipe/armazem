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

Caminho padrão (funciona sem `sudo`): o serviço `armazem-ingress-port-forward` mantém o controller NGINX espelhado na porta local `18080`. Abra:

```text
http://armazem.localhost:18080
```

Esse domínio resolve para `127.0.0.1` sozinho e **não exige alteração no `/etc/hosts`**. A interface usará a API em `/api`. Verificação rápida:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://armazem.localhost:18080/api/health
# esperado: 200
```

Alternativa via NodePort (somente se o NodePort for publicado no host **e** com DNS local):

```bash
echo "127.0.0.1 armazem.local" | sudo tee -a /etc/hosts
```

Abra `http://armazem.local:30558`. Neste cluster kind o NodePort `30558` **não** é alcançável do host; prefira o port-forward `18080`. O encaminhamento manual equivalente é:

```bash
kubectl --context kind-rancher -n ingress-nginx port-forward service/ingress-nginx-controller 18080:80
```

Com o encaminhamento ativo, também vale `http://armazem.local:18080` (exige o `/etc/hosts` acima).

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

## Acesso à interface do Rancher

O Rancher é executado no namespace `cattle-system` e, em clusters kind, o NodePort pode não ser publicado diretamente no host. Para abrir a interface de administração localmente, use o encaminhamento HTTPS:

```bash
kubectl --context kind-rancher -n cattle-system port-forward service/rancher 18443:443
```

Depois acesse `https://rancher.127.0.0.1.sslip.io:18443`. O certificado local pode exigir uma exceção no navegador. O serviço systemd abaixo usa por padrão a porta `18444` (`RANCHER_LOCAL_PORT`); ajuste a URL conforme a porta escolhida. Para manter o acesso ativo automaticamente no login:

```bash
cp k8s/rancher-ui-port-forward.service ~/.config/systemd/user/
chmod +x scripts/start-rancher-port-forward.sh
systemctl --user daemon-reload
systemctl --user enable --now rancher-ui-port-forward.service
systemctl --user status rancher-ui-port-forward.service
```

## Registry

Para publicar em um registry, substitua as imagens em `api.yaml` e `web.yaml` por referências como `ghcr.io/ORG/armazem-api:TAG` e `ghcr.io/ORG/armazem-web:TAG`, remova `imagePullPolicy: IfNotPresent` se desejar a política padrão do registry e configure `imagePullSecrets` quando necessário.

O PostgreSQL está configurado com uma única réplica e PVC de 5 GiB para desenvolvimento e operação inicial. Faça backup e use uma oferta gerenciada ou StatefulSet endurecido antes de produção crítica.

## Notas de hardening local

* `api/web/postgres` têm `requests/limits`, `startupProbe` + `readiness/liveness` com `timeoutSeconds` explícitos e `automountServiceAccountToken: false`.
* API monta `DATABASE_URL` via expansão `$(POSTGRES_PASSWORD)` (sem `sh -c`) e usa FQDN `postgres.armazem.svc.cluster.local`.
* Postgres mantém só `startup/readiness` (`pg_isready`); sem `liveness` para evitar restart em pico de carga.
* Dois Ingresses (`armazem-web` sem rewrite, `armazem-api` com rewrite `/api` → `/$2`). Não unificar: `rewrite-target` é por Ingress e um rewrite global redirecionaria `/_next/*.js` para `/`, entregando HTML no lugar do JS (página trava em “Validando sessão…”). Sem TLS local por padrão.
