#!/bin/bash

# Kubernetes Cleanup Script for Browsers API
# Use this to remove all Kubernetes resources

set -e

NAMESPACE="browsers-api"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show what will be deleted
show_resources() {
    log_info "Resources that will be deleted:"
    echo ""
    
    kubectl get all -n $NAMESPACE 2>/dev/null || echo "No resources found"
    echo ""
    kubectl get pvc -n $NAMESPACE 2>/dev/null || echo "No PVCs found"
    echo ""
    kubectl get secrets -n $NAMESPACE 2>/dev/null || echo "No secrets found"
    echo ""
    kubectl get configmaps -n $NAMESPACE 2>/dev/null || echo "No configmaps found"
}

# Delete deployment
delete_deployment() {
    log_info "Deleting API deployment..."
    kubectl delete -f k8s/api-deployment.yaml --ignore-not-found=true
    kubectl delete -f k8s/api-service.yaml --ignore-not-found=true
    kubectl delete -f k8s/api-hpa.yaml --ignore-not-found=true
    log_info "API deployment deleted"
}

# Delete postgres
delete_postgres() {
    log_warn "Deleting PostgreSQL..."
    log_warn "This will delete the database and all data!"
    
    read -p "Are you sure? (type 'yes' to confirm): " -r
    echo
    
    if [[ $REPLY = "yes" ]]; then
        kubectl delete -f k8s/postgres-statefulset.yaml --ignore-not-found=true
        kubectl delete -f k8s/postgres-service.yaml --ignore-not-found=true
        kubectl delete pvc -l app=postgres -n $NAMESPACE --ignore-not-found=true
        log_info "PostgreSQL deleted"
    else
        log_info "Skipping PostgreSQL deletion"
    fi
}

# Delete configs
delete_configs() {
    log_info "Deleting configurations..."
    kubectl delete -f k8s/configmap.yaml --ignore-not-found=true
    kubectl delete -f k8s/secrets.yaml --ignore-not-found=true
    kubectl delete -f k8s/network-policy.yaml --ignore-not-found=true
    kubectl delete -f k8s/pdb.yaml --ignore-not-found=true
    log_info "Configurations deleted"
}

# Delete namespace
delete_namespace() {
    log_warn "Deleting namespace..."
    log_warn "This will delete ALL resources in the namespace!"
    
    read -p "Are you sure? (type 'DELETE' to confirm): " -r
    echo
    
    if [[ $REPLY = "DELETE" ]]; then
        kubectl delete namespace $NAMESPACE --ignore-not-found=true
        log_info "Namespace deleted"
    else
        log_info "Skipping namespace deletion"
    fi
}

# Partial cleanup (keep data)
partial_cleanup() {
    log_info "Performing partial cleanup (keeping database and data)..."
    delete_deployment
    delete_configs
    log_info "Partial cleanup complete"
}

# Full cleanup
full_cleanup() {
    log_warn "Performing full cleanup..."
    show_resources
    echo ""
    
    read -p "Delete everything including database? (type 'yes' to confirm): " -r
    echo
    
    if [[ $REPLY = "yes" ]]; then
        delete_deployment
        delete_postgres
        delete_configs
        delete_namespace
        log_info "Full cleanup complete"
    else
        log_info "Cleanup cancelled"
    fi
}

# Force cleanup (no confirmation)
force_cleanup() {
    log_warn "Force cleanup - deleting everything without confirmation..."
    kubectl delete namespace $NAMESPACE --ignore-not-found=true --force --grace-period=0
    log_info "Force cleanup complete"
}

# Show help
show_help() {
    cat << EOF
Browsers API Kubernetes Cleanup Script

Usage: $0 [command]

Commands:
    partial     Delete deployment only (keep database and data)
    full        Delete everything including database (with confirmation)
    force       Force delete everything without confirmation
    show        Show resources that would be deleted
    help        Show this help message

Examples:
    $0 partial              # Remove deployment, keep database
    $0 full                 # Remove everything with confirmation
    $0 force                # Force remove everything (use with caution)
    $0 show                 # Show what would be deleted

EOF
}

# Main
main() {
    case "${1:-help}" in
        partial)
            partial_cleanup
            ;;
        full)
            full_cleanup
            ;;
        force)
            force_cleanup
            ;;
        show)
            show_resources
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
