# Kubernetes Deployment Guide

This guide covers deploying the Browsers API to Kubernetes for production use.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Operations](#operations)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Advanced Features](#advanced-features)

## Prerequisites

### Required Tools

```bash
# Install kubectl
brew install kubectl

# Install Minikube (for local testing)
brew install minikube

# Install kustomize (optional but recommended)
brew install kustomize

# Install Helm (optional)
brew install helm
```

### Kubernetes Cluster Options

Choose one for your environment:

1. **Local Development**: Minikube or Docker Desktop Kubernetes
2. **Cloud Providers**: 
   - AWS EKS
   - Google Cloud GKE
   - Azure AKS
   - DigitalOcean Kubernetes
3. **Self-Hosted**: kubeadm, k3s, or RKE

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│          Kubernetes Cluster                 │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │      browsers-api Namespace          │  │
│  │                                      │  │
│  │  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │   Ingress    │  │  LoadBalancer│ │  │
│  │  │  (Optional)  │  │   Service    │ │  │
│  │  └──────┬───────┘  └──────┬───────┘ │  │
│  │         │                 │         │  │
│  │  ┌──────▼─────────────────▼───────┐ │  │
│  │  │   browsers-api Service         │ │  │
│  │  │   (Port 80 → 3333)            │ │  │
│  │  └──────┬─────────────────────────┘ │  │
│  │         │                           │  │
│  │  ┌──────▼─────────────────────────┐ │  │
│  │  │  browsers-api Deployment       │ │  │
│  │  │  Replicas: 3-10 (Auto-scaled) │ │  │
│  │  │                                │ │  │
│  │  │  ┌────┐  ┌────┐  ┌────┐       │ │  │
│  │  │  │Pod │  │Pod │  │Pod │       │ │  │
│  │  │  └────┘  └────┘  └────┘       │ │  │
│  │  └──────┬─────────────────────────┘ │  │
│  │         │                           │  │
│  │  ┌──────▼─────────────────────────┐ │  │
│  │  │   postgres Service (Internal)  │ │  │
│  │  └──────┬─────────────────────────┘ │  │
│  │         │                           │  │
│  │  ┌──────▼─────────────────────────┐ │  │
│  │  │   postgres StatefulSet         │ │  │
│  │  │   (1 Replica + PVC)           │ │  │
│  │  └────────────────────────────────┘ │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Components

| Component | Type | Purpose | Replicas |
|-----------|------|---------|----------|
| **browsers-api** | Deployment | API Server | 3-10 (auto-scaled) |
| **postgres** | StatefulSet | Database | 1 |
| **api-service** | LoadBalancer | External access | - |
| **postgres-service** | ClusterIP | Internal DB access | - |
| **HPA** | Autoscaler | Auto-scaling | - |
| **PDB** | Policy | High availability | - |

## Quick Start

### 1. Build and Push Docker Image

```bash
# Build the image
docker build -t browsers-api:latest .

# Tag for your registry (choose one)
docker tag browsers-api:latest your-registry/browsers-api:latest

# Push to registry
docker push your-registry/browsers-api:latest
```

### 2. Configure Secrets

Edit `k8s/secrets.yaml` and update with your production credentials:

```bash
# Generate base64 encoded secrets
echo -n "your-strong-password" | base64

# Or use kubectl to create secrets
kubectl create secret generic postgres-secret \
  --from-literal=password=your-strong-password \
  --from-literal=username=automation_user \
  --from-literal=database=browser_automation \
  --namespace=browsers-api --dry-run=client -o yaml > k8s/secrets.yaml
```

### 3. Deploy to Kubernetes

```bash
# Create namespace first
kubectl apply -f k8s/namespace.yaml

# Deploy all resources
kubectl apply -f k8s/

# Or use kustomize
kubectl apply -k k8s/

# Verify deployment
kubectl get pods -n browsers-api
kubectl get services -n browsers-api
```

### 4. Access the Application

```bash
# Get the LoadBalancer external IP
kubectl get service browsers-api -n browsers-api

# Wait for EXTERNAL-IP to be assigned
# Then access: http://<EXTERNAL-IP>/api/v1/health

# Or port-forward for local testing
kubectl port-forward -n browsers-api service/browsers-api 3333:80
```

## Configuration

### Environment Variables

All configuration is managed through:

1. **ConfigMap** (`k8s/configmap.yaml`): Non-sensitive config
2. **Secrets** (`k8s/secrets.yaml`): Sensitive data

To update configuration:

```bash
# Edit the ConfigMap
kubectl edit configmap api-config -n browsers-api

# Or apply updated file
kubectl apply -f k8s/configmap.yaml

# Restart pods to pick up changes
kubectl rollout restart deployment/browsers-api -n browsers-api
```

### Resource Limits

Current resource allocation per API pod:

```yaml
Requests:
  CPU: 500m (0.5 cores)
  Memory: 512Mi

Limits:
  CPU: 2000m (2 cores)
  Memory: 2Gi
```

To adjust:

```bash
# Edit deployment
kubectl edit deployment browsers-api -n browsers-api

# Or update k8s/api-deployment.yaml and apply
```

## Deployment

### Standard Deployment

```bash
# Deploy everything
kubectl apply -f k8s/

# Check deployment status
kubectl rollout status deployment/browsers-api -n browsers-api
```

### Rolling Update

```bash
# Update the image
kubectl set image deployment/browsers-api \
  api=browsers-api:v2.0.0 \
  -n browsers-api

# Monitor the rollout
kubectl rollout status deployment/browsers-api -n browsers-api

# Rollback if needed
kubectl rollout undo deployment/browsers-api -n browsers-api
```

### Blue-Green Deployment

```bash
# Create a new deployment with different label
kubectl apply -f k8s/api-deployment-green.yaml

# Test the green deployment
kubectl port-forward deployment/browsers-api-green 3333:3333 -n browsers-api

# Switch traffic by updating service selector
kubectl patch service browsers-api -n browsers-api \
  -p '{"spec":{"selector":{"version":"green"}}}'
```

## Operations

### Scaling

#### Manual Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment browsers-api --replicas=5 -n browsers-api

# Verify
kubectl get pods -n browsers-api
```

#### Auto-Scaling (HPA)

The HPA is configured to scale between 3-10 replicas based on CPU (70%) and Memory (80%) utilization.

```bash
# Check HPA status
kubectl get hpa -n browsers-api

# View autoscaling events
kubectl describe hpa browsers-api-hpa -n browsers-api

# Adjust HPA parameters
kubectl edit hpa browsers-api-hpa -n browsers-api
```

### Health Checks

```bash
# Check pod health
kubectl get pods -n browsers-api

# View detailed pod status
kubectl describe pod <pod-name> -n browsers-api

# Check health endpoint
kubectl exec -it <pod-name> -n browsers-api -- \
  curl http://localhost:3333/api/v1/health
```

### Logs

```bash
# View logs from all API pods
kubectl logs -l app=browsers-api -n browsers-api

# Follow logs in real-time
kubectl logs -f deployment/browsers-api -n browsers-api

# View logs from a specific pod
kubectl logs <pod-name> -n browsers-api

# View previous container logs (after crash)
kubectl logs <pod-name> -n browsers-api --previous

# Save logs to file
kubectl logs -l app=browsers-api -n browsers-api > api-logs.txt
```

### Database Operations

```bash
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n browsers-api -- \
  psql -U automation_user -d browser_automation

# Backup database
kubectl exec postgres-0 -n browsers-api -- \
  pg_dump -U automation_user browser_automation > backup.sql

# Restore database
cat backup.sql | kubectl exec -i postgres-0 -n browsers-api -- \
  psql -U automation_user -d browser_automation
```

### Debugging

```bash
# Get a shell in a pod
kubectl exec -it <pod-name> -n browsers-api -- /bin/bash

# Run debug container
kubectl debug -it <pod-name> -n browsers-api --image=busybox

# Check network connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n browsers-api -- \
  curl http://browsers-api/api/v1/health

# View all events
kubectl get events -n browsers-api --sort-by='.lastTimestamp'
```

## Monitoring

### Metrics

Access Prometheus metrics:

```bash
# Port-forward metrics endpoint
kubectl port-forward -n browsers-api service/browsers-api 9090:9090

# Then visit: http://localhost:9090/metrics
```

### Resource Usage

```bash
# View resource usage by pod
kubectl top pods -n browsers-api

# View resource usage by node
kubectl top nodes

# Detailed resource metrics
kubectl describe nodes
```

### Dashboard Access

```bash
# Install Kubernetes Dashboard (if not already installed)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

# Create service account and get token
kubectl create serviceaccount dashboard-admin -n browsers-api
kubectl create clusterrolebinding dashboard-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=browsers-api:dashboard-admin

# Get token
kubectl -n browsers-api create token dashboard-admin

# Access dashboard
kubectl proxy
# Visit: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl get pods -n browsers-api
kubectl describe pod <pod-name> -n browsers-api

# Common issues:
# 1. Image pull errors - check image name and registry credentials
# 2. Resource limits - check node resources
# 3. Volume mount issues - check PVC status

# Check events
kubectl get events -n browsers-api --sort-by='.lastTimestamp'
```

### Database Connection Issues

```bash
# Check postgres pod
kubectl get pod postgres-0 -n browsers-api

# Check postgres logs
kubectl logs postgres-0 -n browsers-api

# Test connection from API pod
kubectl exec -it <api-pod-name> -n browsers-api -- \
  nc -zv postgres 5432

# Check service DNS
kubectl exec -it <api-pod-name> -n browsers-api -- \
  nslookup postgres
```

### Service Not Accessible

```bash
# Check service
kubectl get service browsers-api -n browsers-api
kubectl describe service browsers-api -n browsers-api

# Check endpoints
kubectl get endpoints browsers-api -n browsers-api

# Check if LoadBalancer got external IP
kubectl get service browsers-api -n browsers-api -w

# Test internal connectivity
kubectl run -it --rm test --image=curlimages/curl --restart=Never -n browsers-api -- \
  curl http://browsers-api/api/v1/health
```

### High Memory/CPU Usage

```bash
# Check resource usage
kubectl top pods -n browsers-api

# Check HPA status
kubectl get hpa -n browsers-api

# Increase resources
kubectl edit deployment browsers-api -n browsers-api
# Update resources.limits and resources.requests

# Scale manually if needed
kubectl scale deployment browsers-api --replicas=10 -n browsers-api
```

### Persistent Volume Issues

```bash
# Check PVC status
kubectl get pvc -n browsers-api

# Check PV status
kubectl get pv

# Describe PVC for events
kubectl describe pvc postgres-data-postgres-0 -n browsers-api

# If PVC is stuck in Pending:
# 1. Check if storage class exists
kubectl get storageclass

# 2. Check if there are available PVs
kubectl get pv

# 3. Check node has available storage
kubectl top nodes
```

## Advanced Features

### Ingress Setup

1. Install NGINX Ingress Controller:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

2. Update `k8s/ingress.yaml` with your domain:

```yaml
spec:
  rules:
  - host: api.yourdomain.com  # Change this
```

3. Apply ingress:

```bash
kubectl apply -f k8s/ingress.yaml
```

4. Update DNS to point to ingress LoadBalancer IP.

### TLS/SSL Certificates

Install cert-manager:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Shared Storage (Optional)

For multi-pod artifact sharing:

1. Set up NFS server or use cloud storage (EFS, Cloud Filestore, etc.)
2. Update `k8s/persistent-volumes.yaml` with your NFS server details
3. Update `k8s/api-deployment.yaml` to use PVC instead of emptyDir:

```yaml
volumes:
- name: artifacts
  persistentVolumeClaim:
    claimName: artifacts-pvc
- name: screenshots
  persistentVolumeClaim:
    claimName: screenshots-pvc
```

### Network Policies

Enable network policies for enhanced security:

```bash
# Apply network policies
kubectl apply -f k8s/network-policy.yaml

# Verify
kubectl get networkpolicies -n browsers-api
```

### Pod Security Standards

Add pod security context:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: api
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: false
      capabilities:
        drop:
        - ALL
```

## Production Checklist

- [ ] Update secrets with strong passwords
- [ ] Configure resource limits appropriately
- [ ] Enable auto-scaling (HPA)
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy for PostgreSQL
- [ ] Enable network policies
- [ ] Set up ingress with TLS
- [ ] Configure persistent storage for artifacts
- [ ] Test disaster recovery procedures
- [ ] Document custom configurations
- [ ] Set up CI/CD pipeline
- [ ] Configure log aggregation
- [ ] Enable pod security policies

## Cloud-Specific Notes

### AWS EKS

```bash
# Create EKS cluster
eksctl create cluster --name browsers-api --region us-west-2 --nodes 3

# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name browsers-api

# Use EBS for storage
# Update storageClassName to "gp2" in postgres-statefulset.yaml
```

### Google Cloud GKE

```bash
# Create GKE cluster
gcloud container clusters create browsers-api --num-nodes=3 --zone=us-central1-a

# Get credentials
gcloud container clusters get-credentials browsers-api --zone=us-central1-a

# Use GCE PD for storage
# Update storageClassName to "standard" in postgres-statefulset.yaml
```

### Azure AKS

```bash
# Create AKS cluster
az aks create --resource-group myResourceGroup --name browsers-api --node-count 3

# Get credentials
az aks get-credentials --resource-group myResourceGroup --name browsers-api

# Use Azure Disk for storage
# Update storageClassName to "managed-premium" in postgres-statefulset.yaml
```

## Migration from Docker Compose

1. Ensure Docker image is built and pushed to registry
2. Update image references in `k8s/api-deployment.yaml`
3. Transfer environment variables from `docker-compose.yml` to `k8s/configmap.yaml`
4. Apply Kubernetes manifests
5. Verify deployment
6. Update external references (DNS, load balancers, etc.)
7. Monitor for issues
8. Scale down Docker Compose services

## Support

For issues and questions:
- Check [Troubleshooting](#troubleshooting) section
- Review Kubernetes logs
- Check official [Kubernetes documentation](https://kubernetes.io/docs/)
