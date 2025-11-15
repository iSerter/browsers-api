# Kubernetes Quick Reference

## Common Commands

### Deployment

```bash
# Deploy all resources
kubectl apply -f k8s/

# Deploy with kustomize
kubectl apply -k k8s/

# Deploy specific resource
kubectl apply -f k8s/api-deployment.yaml

# Delete all resources
kubectl delete -f k8s/
```

### Pod Management

```bash
# List pods
kubectl get pods -n browsers-api

# Watch pods
kubectl get pods -n browsers-api -w

# Describe pod
kubectl describe pod <pod-name> -n browsers-api

# Get pod logs
kubectl logs <pod-name> -n browsers-api

# Follow logs
kubectl logs -f <pod-name> -n browsers-api

# Exec into pod
kubectl exec -it <pod-name> -n browsers-api -- /bin/bash

# Delete pod (will be recreated)
kubectl delete pod <pod-name> -n browsers-api
```

### Service Management

```bash
# List services
kubectl get svc -n browsers-api

# Describe service
kubectl describe svc browsers-api -n browsers-api

# Get service endpoints
kubectl get endpoints browsers-api -n browsers-api

# Port forward
kubectl port-forward svc/browsers-api 3333:80 -n browsers-api
```

### Deployment Management

```bash
# Check rollout status
kubectl rollout status deployment/browsers-api -n browsers-api

# View rollout history
kubectl rollout history deployment/browsers-api -n browsers-api

# Rollback to previous version
kubectl rollout undo deployment/browsers-api -n browsers-api

# Rollback to specific revision
kubectl rollout undo deployment/browsers-api --to-revision=2 -n browsers-api

# Restart deployment
kubectl rollout restart deployment/browsers-api -n browsers-api

# Pause rollout
kubectl rollout pause deployment/browsers-api -n browsers-api

# Resume rollout
kubectl rollout resume deployment/browsers-api -n browsers-api
```

### Scaling

```bash
# Manual scale
kubectl scale deployment browsers-api --replicas=5 -n browsers-api

# Check HPA
kubectl get hpa -n browsers-api

# Describe HPA
kubectl describe hpa browsers-api-hpa -n browsers-api
```

### Configuration

```bash
# Edit ConfigMap
kubectl edit configmap api-config -n browsers-api

# Edit Secret
kubectl edit secret postgres-secret -n browsers-api

# Create secret from literal
kubectl create secret generic my-secret \
  --from-literal=key=value \
  -n browsers-api

# Create secret from file
kubectl create secret generic my-secret \
  --from-file=path/to/file \
  -n browsers-api
```

### Debugging

```bash
# Get events
kubectl get events -n browsers-api --sort-by='.lastTimestamp'

# Describe all resources
kubectl describe all -n browsers-api

# Check resource usage
kubectl top pods -n browsers-api
kubectl top nodes

# Run debug pod
kubectl run -it --rm debug \
  --image=curlimages/curl \
  --restart=Never \
  -n browsers-api -- sh

# Debug network
kubectl run -it --rm netdebug \
  --image=nicolaka/netshoot \
  --restart=Never \
  -n browsers-api -- bash
```

### Database

```bash
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n browsers-api -- \
  psql -U automation_user -d browser_automation

# Backup database
kubectl exec postgres-0 -n browsers-api -- \
  pg_dump -U automation_user browser_automation > backup-$(date +%Y%m%d).sql

# Restore database
cat backup.sql | kubectl exec -i postgres-0 -n browsers-api -- \
  psql -U automation_user -d browser_automation

# Check PVC
kubectl get pvc -n browsers-api
kubectl describe pvc postgres-data-postgres-0 -n browsers-api
```

### Monitoring

```bash
# Get all resources
kubectl get all -n browsers-api

# Watch all resources
watch kubectl get all -n browsers-api

# Get resource usage
kubectl top pods -n browsers-api
kubectl top nodes

# Check metrics
kubectl port-forward svc/browsers-api 9090:9090 -n browsers-api
# Then visit http://localhost:9090/metrics

# Check health
kubectl exec <pod-name> -n browsers-api -- \
  curl http://localhost:3333/api/v1/health
```

### Cleanup

```bash
# Delete specific resource
kubectl delete deployment browsers-api -n browsers-api

# Delete by label
kubectl delete pods -l app=browsers-api -n browsers-api

# Delete all in namespace
kubectl delete all --all -n browsers-api

# Delete namespace (removes everything)
kubectl delete namespace browsers-api

# Force delete stuck resources
kubectl delete pod <pod-name> --grace-period=0 --force -n browsers-api
```

## Troubleshooting Scenarios

### Pod is Pending

```bash
# Check why
kubectl describe pod <pod-name> -n browsers-api

# Common causes:
# - Insufficient resources: kubectl top nodes
# - PVC not bound: kubectl get pvc -n browsers-api
# - Image pull error: Check events in describe output
```

### Pod is CrashLoopBackOff

```bash
# Check logs
kubectl logs <pod-name> -n browsers-api
kubectl logs <pod-name> -n browsers-api --previous

# Check events
kubectl describe pod <pod-name> -n browsers-api

# Common causes:
# - App error on startup
# - Missing environment variables
# - Database connection failure
```

### Service Not Accessible

```bash
# Check service
kubectl get svc browsers-api -n browsers-api

# Check endpoints
kubectl get endpoints browsers-api -n browsers-api

# Test internal connectivity
kubectl run -it --rm test \
  --image=curlimages/curl \
  --restart=Never \
  -n browsers-api -- \
  curl http://browsers-api/api/v1/health

# Check LoadBalancer
kubectl describe svc browsers-api -n browsers-api
```

### Database Connection Failed

```bash
# Check postgres pod
kubectl get pod postgres-0 -n browsers-api

# Check postgres logs
kubectl logs postgres-0 -n browsers-api

# Test connection from API pod
kubectl exec -it <api-pod-name> -n browsers-api -- \
  nc -zv postgres 5432

# Check DNS
kubectl exec -it <api-pod-name> -n browsers-api -- \
  nslookup postgres
```

## Useful Aliases

Add these to your `~/.zshrc` or `~/.bashrc`:

```bash
# Kubectl shortcuts
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deployments'
alias kdp='kubectl describe pod'
alias kds='kubectl describe svc'
alias kl='kubectl logs'
alias klf='kubectl logs -f'
alias kex='kubectl exec -it'
alias kpf='kubectl port-forward'

# Namespace shortcuts
alias kn='kubectl config set-context --current --namespace'
alias kgpn='kubectl get pods -n'
alias kln='kubectl logs -n'

# Browsers API specific
alias k-api='kubectl -n browsers-api'
alias k-api-pods='kubectl get pods -n browsers-api'
alias k-api-logs='kubectl logs -f -l app=browsers-api -n browsers-api'
alias k-api-shell='kubectl exec -it $(kubectl get pod -l app=browsers-api -n browsers-api -o jsonpath="{.items[0].metadata.name}") -n browsers-api -- /bin/bash'
```

## Monitoring Commands

```bash
# Watch pod status
watch kubectl get pods -n browsers-api

# Watch HPA
watch kubectl get hpa -n browsers-api

# Tail all API logs
kubectl logs -f -l app=browsers-api -n browsers-api --tail=100

# Monitor events
kubectl get events -n browsers-api --watch

# Check resource usage continuously
watch kubectl top pods -n browsers-api
```

## Kubectl Context

```bash
# View current context
kubectl config current-context

# List all contexts
kubectl config get-contexts

# Switch context
kubectl config use-context <context-name>

# Set default namespace
kubectl config set-context --current --namespace=browsers-api

# View config
kubectl config view
```

## YAML Shortcuts

```bash
# Get YAML of running resource
kubectl get deployment browsers-api -n browsers-api -o yaml

# Export to file
kubectl get deployment browsers-api -n browsers-api -o yaml > backup.yaml

# Dry run (test without applying)
kubectl apply -f k8s/api-deployment.yaml --dry-run=client

# Validate YAML
kubectl apply -f k8s/api-deployment.yaml --dry-run=server

# Diff before applying
kubectl diff -f k8s/api-deployment.yaml
```

## Resource Management

```bash
# View resource requests/limits
kubectl describe node <node-name> | grep -A 5 "Allocated resources"

# Check quota (if set)
kubectl get resourcequota -n browsers-api

# Check limit ranges (if set)
kubectl get limitrange -n browsers-api
```
