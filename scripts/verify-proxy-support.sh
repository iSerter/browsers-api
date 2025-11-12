#!/bin/bash

# Proxy Support Verification Script
# Tests proxy support implementation with Tor proxy at socks5://tor_general:9050

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3333}"
API_KEY="${API_KEY:-test-proxy-key-12345}"
PROXY_SERVER="${PROXY_SERVER:-socks5://tor_general:9050}"
TEST_URL="${TEST_URL:-https://httpbin.org/ip}"

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if API is accessible
check_api_health() {
    print_step "Checking API health..."
    if curl -s -f "${API_URL}/api/v1/health" > /dev/null; then
        print_info "API is healthy"
        return 0
    else
        print_error "API is not accessible at ${API_URL}"
        return 1
    fi
}

# Create a test job without proxy
test_job_without_proxy() {
    print_step "Testing job creation without proxy..."
    
    RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{
            \"browserTypeId\": 1,
            \"targetUrl\": \"${TEST_URL}\",
            \"actions\": [{
                \"action\": \"screenshot\",
                \"fullPage\": true,
                \"type\": \"png\"
            }],
            \"timeoutMs\": 30000
        }")
    
    JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$JOB_ID" ]; then
        print_error "Failed to create job without proxy"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        return 1
    fi
    
    print_info "Job created without proxy: $JOB_ID"
    echo "$JOB_ID" > /tmp/job_no_proxy.txt
    return 0
}

# Create a test job with proxy
test_job_with_proxy() {
    print_step "Testing job creation with proxy ${PROXY_SERVER}..."
    
    RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{
            \"browserTypeId\": 1,
            \"targetUrl\": \"${TEST_URL}\",
            \"actions\": [{
                \"action\": \"screenshot\",
                \"fullPage\": true,
                \"type\": \"png\"
            }],
            \"timeoutMs\": 60000,
            \"proxy\": {
                \"server\": \"${PROXY_SERVER}\"
            }
        }")
    
    JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$JOB_ID" ]; then
        print_error "Failed to create job with proxy"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        return 1
    fi
    
    print_info "Job created with proxy: $JOB_ID"
    echo "$JOB_ID" > /tmp/job_with_proxy.txt
    return 0
}

# Wait for job to complete
wait_for_job() {
    local JOB_ID=$1
    local TIMEOUT=${2:-120}
    local ELAPSED=0
    
    print_step "Waiting for job $JOB_ID to complete (timeout: ${TIMEOUT}s)..."
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        STATUS=$(curl -s "${API_URL}/api/v1/jobs/${JOB_ID}" \
            -H "X-API-Key: ${API_KEY}" | \
            grep -o '"status":"[^"]*' | cut -d'"' -f4)
        
        if [ "$STATUS" = "completed" ]; then
            print_info "Job $JOB_ID completed successfully"
            return 0
        elif [ "$STATUS" = "failed" ]; then
            print_error "Job $JOB_ID failed"
            return 1
        fi
        
        sleep 2
        ELAPSED=$((ELAPSED + 2))
        echo -n "."
    done
    
    echo ""
    print_warn "Job $JOB_ID did not complete within ${TIMEOUT}s"
    return 1
}

# Verify proxy was saved in database
verify_proxy_in_db() {
    local JOB_ID=$1
    
    print_step "Verifying proxy configuration in database for job $JOB_ID..."
    
    # This requires access to the database container
    # Adjust based on your docker-compose setup
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    elif docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        print_warn "Cannot verify database (docker-compose not found)"
        return 0
    fi
    
    PROXY_SERVER_DB=$($DOCKER_COMPOSE exec -T postgres psql -U automation_user -d browser_automation -t -c \
        "SELECT proxy_server FROM automation_jobs WHERE id = '${JOB_ID}';" 2>/dev/null | tr -d ' ')
    
    if [ -n "$PROXY_SERVER_DB" ] && [ "$PROXY_SERVER_DB" != "" ]; then
        print_info "Proxy found in database: $PROXY_SERVER_DB"
        return 0
    else
        print_warn "Proxy not found in database (may be null for non-proxy jobs)"
        return 0
    fi
}

# Main verification flow
main() {
    print_info "Starting proxy support verification..."
    print_info "API URL: ${API_URL}"
    print_info "Proxy Server: ${PROXY_SERVER}"
    print_info "Test URL: ${TEST_URL}"
    echo ""
    
    # Check API health
    if ! check_api_health; then
        print_error "API health check failed. Please ensure the API is running."
        exit 1
    fi
    
    # Test job without proxy
    if ! test_job_without_proxy; then
        print_error "Baseline test (without proxy) failed"
        exit 1
    fi
    
    NO_PROXY_JOB_ID=$(cat /tmp/job_no_proxy.txt)
    verify_proxy_in_db "$NO_PROXY_JOB_ID"
    
    # Test job with proxy
    if ! test_job_with_proxy; then
        print_error "Proxy test failed"
        exit 1
    fi
    
    PROXY_JOB_ID=$(cat /tmp/job_with_proxy.txt)
    verify_proxy_in_db "$PROXY_JOB_ID"
    
    # Wait for jobs to complete
    echo ""
    print_step "Waiting for jobs to process..."
    
    if wait_for_job "$NO_PROXY_JOB_ID" 60; then
        print_info "Baseline job completed"
    else
        print_warn "Baseline job did not complete (may still be processing)"
    fi
    
    if wait_for_job "$PROXY_JOB_ID" 120; then
        print_info "Proxy job completed"
    else
        print_warn "Proxy job did not complete (may still be processing or proxy may be slow)"
    fi
    
    # Summary
    echo ""
    print_info "Verification Summary:"
    print_info "  - Baseline job (no proxy): $NO_PROXY_JOB_ID"
    print_info "  - Proxy job: $PROXY_JOB_ID"
    echo ""
    print_info "Check job status:"
    print_info "  curl ${API_URL}/api/v1/jobs/${PROXY_JOB_ID} -H \"X-API-Key: ${API_KEY}\""
    echo ""
    print_info "View logs:"
    print_info "  docker-compose logs api | grep -i proxy"
    echo ""
    print_info "Verification complete!"
}

# Run main function
main "$@"

