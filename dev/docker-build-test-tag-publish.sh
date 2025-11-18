#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="iserter/browsers-api"
DOCKERFILE="Dockerfile"
CONTEXT="."

# Function to print colored messages
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to display usage
usage() {
    echo "Usage: $0 <version-tag> [--push]"
    echo ""
    echo "Arguments:"
    echo "  version-tag    Version tag for the image (e.g., v0.0.2)"
    echo "  --push         Push to Docker Hub after tagging (optional)"
    echo ""
    echo "Examples:"
    echo "  $0 v0.0.2"
    echo "  $0 v0.0.2 --push"
    exit 1
}

# Check if version tag is provided
if [ -z "$1" ]; then
    error "Version tag is required"
    usage
fi

VERSION_TAG="$1"
PUSH_TO_HUB=false

# Check for --push flag
if [ "$2" == "--push" ]; then
    PUSH_TO_HUB=true
fi

# Validate version tag format (basic validation)
if [[ ! "$VERSION_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    warning "Version tag '$VERSION_TAG' doesn't match standard format (vX.Y.Z)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Aborted"
        exit 1
    fi
fi

info "Starting Docker build, test, tag, and publish process"
info "Version tag: $VERSION_TAG"
info "Image name: $IMAGE_NAME"
info "Push to Docker Hub: $PUSH_TO_HUB"
echo ""

# Step 1: Build the image
info "Step 1: Building Docker image..."
if docker build \
    -t "${IMAGE_NAME}:latest" \
    -t "${IMAGE_NAME}:${VERSION_TAG}" \
    -f "$DOCKERFILE" \
    "$CONTEXT"; then
    success "Docker image built successfully"
else
    error "Docker build failed"
    exit 1
fi

echo ""

# Step 2: Verify image exists
info "Step 2: Verifying image exists..."
if docker image inspect "${IMAGE_NAME}:${VERSION_TAG}" > /dev/null 2>&1; then
    success "Image verified: ${IMAGE_NAME}:${VERSION_TAG}"
    
    # Display image info
    IMAGE_ID=$(docker image inspect "${IMAGE_NAME}:${VERSION_TAG}" --format '{{.Id}}' | cut -d: -f2 | cut -c1-12)
    IMAGE_SIZE=$(docker images "${IMAGE_NAME}:${VERSION_TAG}" --format "{{.Size}}")
    info "Image ID: $IMAGE_ID"
    info "Image Size: $IMAGE_SIZE"
else
    error "Image verification failed"
    exit 1
fi

echo ""

# Step 3: Test the image (basic container test)
info "Step 3: Testing image with basic container test..."
TEST_CONTAINER_NAME="browsers-api-test-${VERSION_TAG//./-}-$$"

# Clean up function
cleanup_test() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${TEST_CONTAINER_NAME}$"; then
        info "Cleaning up test container..."
        docker rm -f "$TEST_CONTAINER_NAME" > /dev/null 2>&1 || true
    fi
}

trap cleanup_test EXIT

# Run a basic test: check if container starts and Node.js is available
if docker run --rm \
    --name "$TEST_CONTAINER_NAME" \
    "${IMAGE_NAME}:${VERSION_TAG}" \
    node --version > /dev/null 2>&1; then
    success "Basic container test passed (Node.js available)"
else
    error "Basic container test failed"
    exit 1
fi

echo ""

# Step 4: Display image tags
info "Step 4: Image tags created:"
docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" | head -3
echo ""

# Step 5: Push to Docker Hub (if requested)
if [ "$PUSH_TO_HUB" = true ]; then
    info "Step 5: Pushing images to Docker Hub..."
    
    # Check if logged in to Docker Hub
    if ! docker info | grep -q "Username"; then
        warning "Not logged in to Docker Hub"
        info "Please login first: docker login"
        read -p "Login now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker login
        else
            warning "Skipping push. You can push manually later:"
            info "  docker push ${IMAGE_NAME}:latest"
            info "  docker push ${IMAGE_NAME}:${VERSION_TAG}"
            exit 0
        fi
    fi
    
    # Push latest tag
    info "Pushing ${IMAGE_NAME}:latest..."
    if docker push "${IMAGE_NAME}:latest"; then
        success "Pushed ${IMAGE_NAME}:latest"
    else
        error "Failed to push ${IMAGE_NAME}:latest"
        exit 1
    fi
    
    # Push version tag
    info "Pushing ${IMAGE_NAME}:${VERSION_TAG}..."
    if docker push "${IMAGE_NAME}:${VERSION_TAG}"; then
        success "Pushed ${IMAGE_NAME}:${VERSION_TAG}"
    else
        error "Failed to push ${IMAGE_NAME}:${VERSION_TAG}"
        exit 1
    fi
    
    echo ""
    success "All images pushed successfully to Docker Hub"
    info "View at: https://hub.docker.com/r/${IMAGE_NAME}/tags"
else
    info "Step 5: Skipping push (use --push flag to push to Docker Hub)"
    info "To push manually, run:"
    info "  docker push ${IMAGE_NAME}:latest"
    info "  docker push ${IMAGE_NAME}:${VERSION_TAG}"
fi

echo ""
success "Process completed successfully!"
info "Image: ${IMAGE_NAME}:${VERSION_TAG}"
info "Image: ${IMAGE_NAME}:latest"

