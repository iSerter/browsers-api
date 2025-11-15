#!/bin/bash

# Kubernetes Monitoring Script for Browsers API
# This script helps monitor the deployed application

set -e

NAMESPACE="browsers-api"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Show pod status
show_pods() {
    log_section "Pods Status"
    kubectl get pods -n $NAMESPACE -o wide
}

# Show service status
show_services() {
    log_section "Services Status"
    kubectl get services -n $NAMESPACE
}

# Show HPA status
show_hpa() {
    log_section "Horizontal Pod Autoscaler"
    kubectl get hpa -n $NAMESPACE
    echo ""
    kubectl describe hpa browsers-api-hpa -n $NAMESPACE 2>/dev/null || echo "HPA not found"
}

# Show resource usage
show_resources() {
    log_section "Resource Usage"
    echo "Pods:"
    kubectl top pods -n $NAMESPACE 2>/dev/null || echo "Metrics not available"
    echo ""
    echo "Nodes:"
    kubectl top nodes 2>/dev/null || echo "Metrics not available"
}

# Show recent events
show_events() {
    log_section "Recent Events"
    kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -20
}

# Show deployment status
show_deployments() {
    log_section "Deployments"
    kubectl get deployments -n $NAMESPACE
    echo ""
    kubectl rollout status deployment/browsers-api -n $NAMESPACE 2>/dev/null || echo "Deployment not found"
}

# Show StatefulSet status
show_statefulsets() {
    log_section "StatefulSets"
    kubectl get statefulsets -n $NAMESPACE
}

# Show PVC status
show_pvcs() {
    log_section "Persistent Volume Claims"
    kubectl get pvc -n $NAMESPACE
}

# Show logs
show_logs() {
    local component="${1:-api}"
    local lines="${2:-50}"
    
    log_section "Logs - $component (last $lines lines)"
    
    if [ "$component" = "api" ]; then
        kubectl logs -l app=browsers-api -n $NAMESPACE --tail=$lines
    elif [ "$component" = "postgres" ]; then
        kubectl logs postgres-0 -n $NAMESPACE --tail=$lines
    else
        log_info "Unknown component: $component"
    fi
}

# Follow logs
follow_logs() {
    local component="${1:-api}"
    
    log_section "Following logs - $component"
    
    if [ "$component" = "api" ]; then
        kubectl logs -f -l app=browsers-api -n $NAMESPACE --tail=100
    elif [ "$component" = "postgres" ]; then
        kubectl logs -f postgres-0 -n $NAMESPACE --tail=100
    else
        log_info "Unknown component: $component"
    fi
}

# Check health
check_health() {
    log_section "Health Check"
    
    # Get a pod name
    POD=$(kubectl get pod -l app=browsers-api -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}" 2>/dev/null)
    
    if [ -z "$POD" ]; then
        echo "No API pods found"
        return 1
    fi
    
    echo "Checking health endpoint on pod: $POD"
    kubectl exec $POD -n $NAMESPACE -- curl -s http://localhost:3333/api/v1/health | jq '.' 2>/dev/null || \
    kubectl exec $POD -n $NAMESPACE -- curl -s http://localhost:3333/api/v1/health
}

# Show all
show_all() {
    show_pods
    show_services
    show_deployments
    show_statefulsets
    show_hpa
    show_resources
    show_pvcs
    show_events
    check_health
}

# Watch mode
watch_status() {
    while true; do
        clear
        echo "Browsers API Kubernetes Monitor"
        echo "================================"
        show_pods
        show_services
        show_hpa
        show_resources
        echo ""
        echo "Refreshing in 5 seconds... (Ctrl+C to exit)"
        sleep 5
    done
}

# Port forward
port_forward() {
    local port="${1:-3333}"
    log_info "Port forwarding service to localhost:$port"
    kubectl port-forward -n $NAMESPACE service/browsers-api $port:80
}

# Shell access
shell_access() {
    local component="${1:-api}"
    
    if [ "$component" = "api" ]; then
        POD=$(kubectl get pod -l app=browsers-api -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
        log_info "Opening shell in API pod: $POD"
        kubectl exec -it $POD -n $NAMESPACE -- /bin/bash
    elif [ "$component" = "postgres" ]; then
        log_info "Opening shell in PostgreSQL pod"
        kubectl exec -it postgres-0 -n $NAMESPACE -- /bin/bash
    else
        log_info "Unknown component: $component"
    fi
}

# Database access
db_access() {
    log_info "Connecting to PostgreSQL..."
    kubectl exec -it postgres-0 -n $NAMESPACE -- psql -U automation_user -d browser_automation
}

# Show help
show_help() {
    cat << EOF
Browsers API Kubernetes Monitor

Usage: $0 [command] [options]

Commands:
    all                     Show all status information (default)
    pods                    Show pods status
    services                Show services status
    deployments             Show deployments status
    hpa                     Show HPA status
    resources               Show resource usage
    events                  Show recent events
    health                  Check application health
    logs [component] [n]    Show logs (component: api|postgres, n: number of lines)
    follow [component]      Follow logs (component: api|postgres)
    watch                   Watch status in real-time
    port-forward [port]     Port forward service to localhost (default: 3333)
    shell [component]       Open shell (component: api|postgres)
    db                      Connect to PostgreSQL database

Examples:
    $0                      # Show all status
    $0 pods                 # Show pods only
    $0 logs api 100         # Show last 100 lines of API logs
    $0 follow postgres      # Follow PostgreSQL logs
    $0 watch                # Watch status in real-time
    $0 port-forward 8080    # Port forward to localhost:8080
    $0 shell api            # Open shell in API pod
    $0 db                   # Connect to database

EOF
}

# Main
main() {
    case "${1:-all}" in
        all)
            show_all
            ;;
        pods)
            show_pods
            ;;
        services)
            show_services
            ;;
        deployments)
            show_deployments
            ;;
        statefulsets)
            show_statefulsets
            ;;
        hpa)
            show_hpa
            ;;
        resources)
            show_resources
            ;;
        events)
            show_events
            ;;
        pvcs)
            show_pvcs
            ;;
        health)
            check_health
            ;;
        logs)
            show_logs "${2:-api}" "${3:-50}"
            ;;
        follow)
            follow_logs "${2:-api}"
            ;;
        watch)
            watch_status
            ;;
        port-forward)
            port_forward "${2:-3333}"
            ;;
        shell)
            shell_access "${2:-api}"
            ;;
        db)
            db_access
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"
