# Kubernetes Configuration

This directory contains Kubernetes manifests for deploying the Browsers API application.

## 📁 Files Overview

| File | Purpose |
|------|---------|
| `namespace.yaml` | Creates isolated namespace for the application |
| `secrets.yaml` | Stores sensitive data (passwords, API keys) |
| `configmap.yaml` | Application configuration (non-sensitive) |
| `postgres-statefulset.yaml` | PostgreSQL database with persistent storage |
| `postgres-service.yaml` | Internal service for database access |
| `api-deployment.yaml` | API application deployment (3+ replicas) |
| `api-service.yaml` | LoadBalancer service for external access |
| `api-hpa.yaml` | Horizontal Pod Autoscaler (3-10 replicas) |
| `pdb.yaml` | Pod Disruption Budgets for high availability |
| `network-policy.yaml` | Network security policies |
| `ingress.yaml` | Ingress configuration (optional) |
| `persistent-volumes.yaml` | Shared storage configuration (optional) |
| `kustomization.yaml` | Kustomize configuration for easy deployment |

## 🚀 Quick Start

### Prerequisites

```bash
# Ensure kubectl is installed and configured
kubectl version

# Ensure you're connected to the right cluster
kubectl cluster-info
```

### Deploy

```bash
# Option 1: Using helper script
./scripts/k8s/deploy.sh all

# Option 2: Manual deployment
kubectl apply -f k8s/

# Option 3: Using kustomize
kubectl apply -k k8s/
```

## 🔧 Configuration

### Before Deploying

1. **Update Secrets** (`secrets.yaml`):
   ```bash
   # Generate strong password
   openssl rand -base64 32
   
   # Edit secrets.yaml with your values
   ```

2. **Update Image** (`api-deployment.yaml`):
   ```yaml
   image: your-registry/browsers-api:latest
   ```

3. **Update Domain** (`ingress.yaml`):
   ```yaml
   host: api.yourdomain.com
   ```

## 📊 Monitoring

```bash
# Use monitoring script
./scripts/k8s/monitor.sh

# Available commands:
./scripts/k8s/monitor.sh pods       # Show pods
./scripts/k8s/monitor.sh logs api   # Show logs
./scripts/k8s/monitor.sh health     # Health check
./scripts/k8s/monitor.sh watch      # Real-time monitoring
```

## 🔄 Updates

```bash
# Update deployment with new image
kubectl set image deployment/browsers-api \
  api=browsers-api:v2.0.0 \
  -n browsers-api

# Check rollout status
kubectl rollout status deployment/browsers-api -n browsers-api

# Rollback if needed
kubectl rollout undo deployment/browsers-api -n browsers-api
```

## 🧹 Cleanup

```bash
# Use cleanup script
./scripts/k8s/cleanup.sh partial  # Keep database
./scripts/k8s/cleanup.sh full     # Delete everything
./scripts/k8s/cleanup.sh force    # Force delete (no confirm)
```

## 🏗️ Architecture

```
Internet
    ↓
LoadBalancer (port 80)
    ↓
browsers-api Service
    ↓
browsers-api Pods (3-10 replicas)
    ↓
postgres Service
    ↓
postgres StatefulSet (1 replica)
    ↓
Persistent Volume (10Gi)
```

## 📚 Documentation

- [Full Kubernetes Guide](../docs/KUBERNETES.md)
- [Quick Reference](../docs/K8S-QUICKREF.md)

## 🔐 Security Features

- ✅ Secrets management
- ✅ Network policies (pod-to-pod communication)
- ✅ Resource limits and requests
- ✅ Pod Disruption Budgets
- ✅ Health checks (liveness & readiness probes)
- ✅ Non-root containers (configurable)

## 🎯 Production Features

- ✅ Auto-scaling (3-10 replicas based on CPU/memory)
- ✅ Rolling updates (zero-downtime deployments)
- ✅ Self-healing (automatic pod restart)
- ✅ High availability (multiple replicas)
- ✅ Persistent storage for database
- ✅ Resource management (CPU/memory limits)
- ✅ Load balancing across pods

## 🛠️ Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n browsers-api
kubectl logs <pod-name> -n browsers-api
```

### Service not accessible

```bash
# Check service
kubectl get svc browsers-api -n browsers-api

# Check endpoints
kubectl get endpoints browsers-api -n browsers-api

# Port-forward for testing
kubectl port-forward svc/browsers-api 3333:80 -n browsers-api
```

### Database connection issues

```bash
# Check postgres pod
kubectl get pod postgres-0 -n browsers-api

# Check postgres logs
kubectl logs postgres-0 -n browsers-api

# Test connection
kubectl exec -it <api-pod> -n browsers-api -- \
  nc -zv postgres 5432
```

## 🌐 Cloud Provider Notes

### AWS EKS
- Use EBS for persistent volumes
- StorageClass: `gp2` or `gp3`

### Google GKE
- Use GCE Persistent Disk
- StorageClass: `standard` or `pd-ssd`

### Azure AKS
- Use Azure Disk
- StorageClass: `managed-premium`

## 📝 Notes

- **Database**: Single replica StatefulSet with persistent storage
- **API**: Multi-replica Deployment with auto-scaling
- **Storage**: By default uses emptyDir; configure PVs for shared storage
- **Networking**: ClusterIP for internal, LoadBalancer for external access
