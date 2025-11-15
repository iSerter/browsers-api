#!/bin/bash

# Kubernetes Deployment Script for Browsers API
# This script helps deploy the application to Kubernetes

set -e

NAMESPACE="browsers-api"
IMAGE_NAME="browsers-api"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed"
        exit 1
    fi
    
    # Check if kubectl can connect
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

build_image() {
    log_info "Building Docker image..."
    
    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
    
    if [ -n "$REGISTRY" ]; then
        log_info "Tagging image for registry: $REGISTRY"
        docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
    fi
    
    log_info "Image built successfully"
}

push_image() {
    if [ -n "$REGISTRY" ]; then
        log_info "Pushing image to registry..."
        docker push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
        log_info "Image pushed successfully"
    else
        log_warn "No registry specified, skipping push"
    fi
}

create_namespace() {
    log_info "Creating namespace..."
    
    if kubectl get namespace $NAMESPACE &> /dev/null; then
        log_warn "Namespace $NAMESPACE already exists"
    else
        kubectl apply -f k8s/namespace.yaml
        log_info "Namespace created"
    fi
}

apply_secrets() {
    log_info "Applying secrets..."
    
    log_warn "Make sure you've updated k8s/secrets.yaml with production credentials!"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl apply -f k8s/secrets.yaml
        log_info "Secrets applied"
    else
        log_error "Deployment cancelled"
        exit 1
    fi
}

apply_configs() {
    log_info "Applying configurations..."
    kubectl apply -f k8s/configmap.yaml
    log_info "Configurations applied"
}

deploy_postgres() {
    log_info "Deploying PostgreSQL..."
    kubectl apply -f k8s/postgres-service.yaml
    kubectl apply -f k8s/postgres-statefulset.yaml
    
    log_info "Waiting for PostgreSQL to be ready..."
    kubectl wait --for=condition=ready pod/postgres-0 -n $NAMESPACE --timeout=300s
    
    log_info "PostgreSQL deployed and ready"
}

deploy_api() {
    log_info "Deploying API..."
    
    # Update image in deployment if registry is specified
    if [ -n "$REGISTRY" ]; then
        log_info "Updating deployment with registry image"
        kubectl set image deployment/browsers-api api=${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f - || \
        kubectl apply -f k8s/api-deployment.yaml
        kubectl set image deployment/browsers-api api=${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} -n $NAMESPACE
    else
        kubectl apply -f k8s/api-deployment.yaml
    fi
    
    kubectl apply -f k8s/api-service.yaml
    kubectl apply -f k8s/api-hpa.yaml
    kubectl apply -f k8s/pdb.yaml
    
    log_info "Waiting for API deployment to be ready..."
    kubectl rollout status deployment/browsers-api -n $NAMESPACE
    
    log_info "API deployed successfully"
}

apply_network_policies() {
    log_info "Applying network policies..."
    kubectl apply -f k8s/network-policy.yaml
    log_info "Network policies applied"
}

display_status() {
    log_info "Deployment Status:"
    echo ""
    
    echo "Pods:"
    kubectl get pods -n $NAMESPACE
    echo ""
    
    echo "Services:"
    kubectl get services -n $NAMESPACE
    echo ""
    
    echo "HPA:"
    kubectl get hpa -n $NAMESPACE
    echo ""
    
    # Get LoadBalancer IP/hostname
    log_info "Getting service endpoint..."
    EXTERNAL_IP=$(kubectl get service browsers-api -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    EXTERNAL_HOSTNAME=$(kubectl get service browsers-api -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    
    if [ -n "$EXTERNAL_IP" ]; then
        log_info "Service available at: http://$EXTERNAL_IP/api/v1/health"
    elif [ -n "$EXTERNAL_HOSTNAME" ]; then
        log_info "Service available at: http://$EXTERNAL_HOSTNAME/api/v1/health"
    else
        log_warn "LoadBalancer external IP/hostname not yet assigned"
        log_info "Use port-forward to access: kubectl port-forward -n $NAMESPACE service/browsers-api 3333:80"
    fi
}

# Main deployment flow
main() {
    log_info "Starting Browsers API Kubernetes Deployment"
    echo ""
    
    check_prerequisites
    
    # Parse command line arguments
    case "${1:-all}" in
        build)
            build_image
            ;;
        push)
            push_image
            ;;
        deploy)
            create_namespace
            apply_secrets
            apply_configs
            deploy_postgres
            deploy_api
            apply_network_policies
            display_status
            ;;
        all)
            build_image
            push_image
            create_namespace
            apply_secrets
            apply_configs
            deploy_postgres
            deploy_api
            apply_network_policies
            display_status
            ;;
        status)
            display_status
            ;;
        *)
            echo "Usage: $0 {build|push|deploy|all|status}"
            echo ""
            echo "Commands:"
            echo "  build   - Build Docker image only"
            echo "  push    - Push Docker image to registry"
            echo "  deploy  - Deploy to Kubernetes (without building)"
            echo "  all     - Build, push, and deploy (default)"
            echo "  status  - Show deployment status"
            echo ""
            echo "Environment Variables:"
            echo "  IMAGE_TAG - Docker image tag (default: latest)"
            echo "  REGISTRY  - Docker registry URL (optional)"
            echo ""
            echo "Example:"
            echo "  REGISTRY=your-registry.io IMAGE_TAG=v1.0.0 $0 all"
            exit 1
            ;;
    esac
    
    log_info "Done!"
}

main "$@"
