#!/bin/bash

# Docker Development Helper Script for Browsers API
# Simplifies common Docker operations for contributors

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect docker-compose command (handle both docker-compose and docker compose)
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo -e "${RED}[ERROR]${NC} Neither 'docker-compose' nor 'docker compose' found. Please install Docker Compose."
    exit 1
fi

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
check_env() {
    if [ ! -f .env ]; then
        print_warn ".env file not found. Copying from .env.example..."
        cp .env.example .env
        print_info ".env file created. Please review and update as needed."
    fi
}

# Build Docker image
build_image() {
    print_info "Building Docker image..."
    docker build -t browsers-api:latest .
    print_info "Build complete!"
}

# Run container with docker-compose
run_stack() {
    check_env
    print_info "Starting full stack with $DOCKER_COMPOSE..."
    $DOCKER_COMPOSE up -d
    print_info "Stack is running!"
    print_info "API available at http://localhost:3333"
    print_info "Metrics available at http://localhost:9090/metrics"
}

# Stop docker-compose stack
stop_stack() {
    print_info "Stopping stack..."
    $DOCKER_COMPOSE down
    print_info "Stack stopped!"
}

# View logs
view_logs() {
    print_info "Viewing API logs (Ctrl+C to exit)..."
    $DOCKER_COMPOSE logs -f api
}

# Run database migrations
run_migrations() {
    print_info "Running database migrations..."
    $DOCKER_COMPOSE run --rm api npm run migration:run
    print_info "Migrations complete!"
}

# Run database seeds
run_seeds() {
    print_info "Running database seeds..."
    $DOCKER_COMPOSE run --rm api npm run seed
    print_info "Seeds complete!"
}

# Clean up containers and volumes
clean() {
    print_warn "This will remove all containers, volumes, and images for browsers-api"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up..."
        $DOCKER_COMPOSE down -v
        docker rmi browsers-api:latest 2>/dev/null || true
        print_info "Cleanup complete!"
    else
        print_info "Cleanup cancelled."
    fi
}

# Show usage
show_usage() {
    cat << EOF
Docker Development Helper for Browsers API

Usage: ./scripts/docker-dev.sh [command]

Commands:
    build           Build the Docker image
    start           Start the full stack (PostgreSQL + API)
    stop            Stop the full stack
    logs            View API logs
    migrate         Run database migrations
    seed            Run database seeds
    clean           Remove all containers, volumes, and images
    help            Show this help message

Examples:
    ./scripts/docker-dev.sh build
    ./scripts/docker-dev.sh start
    ./scripts/docker-dev.sh logs

EOF
}

# Main script logic
case "${1:-}" in
    build)
        build_image
        ;;
    start)
        run_stack
        ;;
    stop)
        stop_stack
        ;;
    logs)
        view_logs
        ;;
    migrate)
        run_migrations
        ;;
    seed)
        run_seeds
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: ${1:-}"
        echo
        show_usage
        exit 1
        ;;
esac
