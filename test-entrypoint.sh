#!/bin/bash
# Test script to validate docker-entrypoint.sh logic

set -e

echo "Testing docker-entrypoint.sh implementation..."
echo ""

# Test 1: Check if script exists and is executable
echo "Test 1: Checking script file..."
if [ ! -f "docker-entrypoint.sh" ]; then
  echo "❌ FAIL: docker-entrypoint.sh not found"
  exit 1
fi
if [ ! -x "docker-entrypoint.sh" ]; then
  echo "⚠️  WARNING: docker-entrypoint.sh is not executable (will be fixed in Dockerfile)"
else
  echo "✓ PASS: Script exists and is executable"
fi

# Test 2: Check script syntax
echo ""
echo "Test 2: Checking script syntax..."
if bash -n docker-entrypoint.sh; then
  echo "✓ PASS: Script syntax is valid"
else
  echo "❌ FAIL: Script has syntax errors"
  exit 1
fi

# Test 3: Check for required functions
echo ""
echo "Test 3: Checking for required functions..."
if grep -q "cleanup()" docker-entrypoint.sh && \
   grep -q "handle_shutdown()" docker-entrypoint.sh; then
  echo "✓ PASS: Required functions found (cleanup, handle_shutdown)"
else
  echo "❌ FAIL: Missing required functions"
  exit 1
fi

# Test 4: Check for Xvfb configuration reading
echo ""
echo "Test 4: Checking Xvfb configuration handling..."
if grep -q "XVFB_ENABLED" docker-entrypoint.sh && \
   grep -q "XVFB_DISPLAY" docker-entrypoint.sh && \
   grep -q "XVFB_SCREEN" docker-entrypoint.sh && \
   grep -q "XVFB_RESOLUTION" docker-entrypoint.sh; then
  echo "✓ PASS: Xvfb configuration variables are handled"
else
  echo "❌ FAIL: Missing Xvfb configuration handling"
  exit 1
fi

# Test 5: Check for DISPLAY environment variable setting
echo ""
echo "Test 5: Checking DISPLAY environment variable..."
if grep -q "export DISPLAY" docker-entrypoint.sh; then
  echo "✓ PASS: DISPLAY environment variable is set"
else
  echo "❌ FAIL: DISPLAY environment variable not set"
  exit 1
fi

# Test 6: Check for signal handling
echo ""
echo "Test 6: Checking signal handling..."
if grep -q "trap.*SIGTERM" docker-entrypoint.sh && \
   grep -q "trap.*SIGINT" docker-entrypoint.sh; then
  echo "✓ PASS: Signal handlers are set up"
else
  echo "❌ FAIL: Missing signal handlers"
  exit 1
fi

# Test 7: Check for Node.js startup
echo ""
echo "Test 7: Checking Node.js startup..."
if grep -q "node dist/main.js" docker-entrypoint.sh; then
  echo "✓ PASS: Node.js application startup found"
else
  echo "❌ FAIL: Node.js startup not found"
  exit 1
fi

# Test 8: Check Dockerfile for Xvfb installation
echo ""
echo "Test 8: Checking Dockerfile for Xvfb installation..."
if grep -q "xvfb" Dockerfile && grep -q "x11-utils" Dockerfile; then
  echo "✓ PASS: Xvfb packages are installed in Dockerfile"
else
  echo "❌ FAIL: Xvfb packages not found in Dockerfile"
  exit 1
fi

# Test 9: Check Dockerfile for entrypoint script
echo ""
echo "Test 9: Checking Dockerfile for entrypoint script..."
if grep -q "docker-entrypoint.sh" Dockerfile && \
   grep -q "chmod +x docker-entrypoint.sh" Dockerfile; then
  echo "✓ PASS: Entrypoint script is copied and made executable"
else
  echo "❌ FAIL: Entrypoint script not properly configured in Dockerfile"
  exit 1
fi

# Test 10: Check Dockerfile CMD
echo ""
echo "Test 10: Checking Dockerfile CMD..."
if grep -q 'CMD \["\./docker-entrypoint\.sh"\]' Dockerfile || \
   grep -q 'CMD \["./docker-entrypoint.sh"\]' Dockerfile; then
  echo "✓ PASS: Dockerfile CMD uses entrypoint script"
else
  echo "❌ FAIL: Dockerfile CMD not updated to use entrypoint script"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ All tests passed!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Entrypoint script syntax: ✓ Valid"
echo "  - Required functions: ✓ Present"
echo "  - Xvfb configuration: ✓ Handled"
echo "  - DISPLAY variable: ✓ Set"
echo "  - Signal handling: ✓ Implemented"
echo "  - Node.js startup: ✓ Configured"
echo "  - Dockerfile: ✓ Updated"
echo ""

