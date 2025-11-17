#!/bin/bash
set -e

# Script to build and run tests in Docker
# Usage: ./scripts/docker-test.sh [test-type]
# test-type can be: unit, e2e, all (default: all)

TEST_TYPE=${1:-all}
IMAGE_NAME="browsers-api-test"
CONTAINER_NAME="browsers-api-test-$(date +%s)"

echo "=========================================="
echo "Building Docker image for testing..."
echo "=========================================="

# Build the test stage
docker build --target test -t ${IMAGE_NAME} .

echo ""
echo "=========================================="
echo "Running tests: ${TEST_TYPE}"
echo "=========================================="

# Determine which test command to run
case ${TEST_TYPE} in
  unit)
    TEST_CMD="npm test"
    ;;
  e2e)
    TEST_CMD="npm run test:e2e"
    ;;
  all)
    TEST_CMD="npm test && npm run test:e2e"
    ;;
  *)
    echo "Unknown test type: ${TEST_TYPE}"
    echo "Valid options: unit, e2e, all"
    exit 1
    ;;
esac

# Run tests in container
docker run --rm \
  --name ${CONTAINER_NAME} \
  ${IMAGE_NAME} \
  sh -c "${TEST_CMD}"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "✅ All tests passed!"
  echo "=========================================="
else
  echo ""
  echo "=========================================="
  echo "❌ Tests failed with exit code: ${EXIT_CODE}"
  echo "=========================================="
fi

exit $EXIT_CODE

