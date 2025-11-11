#!/bin/bash
set -e

# Function to handle shutdown signals
cleanup() {
  echo "Cleaning up processes..."
  
  # Kill Node.js process if it's running
  if [ ! -z "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
    echo "Stopping Node.js application (PID: $NODE_PID)..."
    kill -TERM "$NODE_PID" 2>/dev/null || true
    # Wait up to 10 seconds for graceful shutdown
    for i in {1..10}; do
      if ! kill -0 "$NODE_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    # Force kill if still running
    if kill -0 "$NODE_PID" 2>/dev/null; then
      echo "Force killing Node.js process..."
      kill -KILL "$NODE_PID" 2>/dev/null || true
    fi
    wait "$NODE_PID" 2>/dev/null || true
  fi
  
  # Kill Xvfb process if it's running
  if [ ! -z "$XVFB_PID" ] && kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "Stopping Xvfb (PID: $XVFB_PID)..."
    kill -TERM "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
  fi
  
  echo "Cleanup complete"
}

# Function to handle shutdown signals
handle_shutdown() {
  echo "Received shutdown signal..."
  
  # First, forward signal to Node.js so it can handle it gracefully
  if [ ! -z "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
  fi
  
  # Wait a bit for Node.js to handle the signal
  sleep 2
  
  # Then cleanup everything
  cleanup
  exit 0
}

# Set up signal handlers
trap handle_shutdown SIGTERM SIGINT

# Default Xvfb configuration
XVFB_ENABLED=${XVFB_ENABLED:-false}
XVFB_DISPLAY=${XVFB_DISPLAY:-:99}
XVFB_SCREEN=${XVFB_SCREEN:-0}
XVFB_RESOLUTION=${XVFB_RESOLUTION:-1920x1080x24}
XVFB_ARGS=${XVFB_ARGS:-}

# Start Xvfb if enabled
if [ "$XVFB_ENABLED" = "true" ]; then
  echo "Starting Xvfb..."
  echo "  Display: $XVFB_DISPLAY"
  echo "  Screen: $XVFB_SCREEN"
  echo "  Resolution: $XVFB_RESOLUTION"
  echo "  Additional args: ${XVFB_ARGS:-none}"
  
  # Build Xvfb command
  XVFB_CMD="Xvfb ${XVFB_DISPLAY} -screen ${XVFB_SCREEN} ${XVFB_RESOLUTION} -ac +extension GLX +render -noreset"
  
  # Add additional arguments if provided
  if [ ! -z "$XVFB_ARGS" ]; then
    XVFB_CMD="${XVFB_CMD} ${XVFB_ARGS}"
  fi
  
  # Start Xvfb in background
  $XVFB_CMD > /tmp/xvfb.log 2>&1 &
  XVFB_PID=$!
  
  # Set DISPLAY environment variable
  export DISPLAY="${XVFB_DISPLAY}.${XVFB_SCREEN}"
  echo "DISPLAY set to: $DISPLAY"
  
  # Wait for Xvfb to be ready (check if display is accessible)
  echo "Waiting for Xvfb to be ready..."
  MAX_WAIT=10
  WAIT_COUNT=0
  while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # Check if Xvfb process is still running
    if ! kill -0 $XVFB_PID 2>/dev/null; then
      echo "ERROR: Xvfb process died during startup"
      cat /tmp/xvfb.log || true
      exit 1
    fi
    # Try to check if display is accessible (if xdpyinfo is available)
    if command -v xdpyinfo > /dev/null 2>&1; then
      if xdpyinfo -display "$DISPLAY" > /dev/null 2>&1; then
        echo "Xvfb is ready!"
        break
      fi
    else
      # If xdpyinfo is not available, just wait a bit and assume it's ready
      if [ $WAIT_COUNT -ge 2 ]; then
        echo "Xvfb should be ready (xdpyinfo not available for verification)"
        break
      fi
    fi
    WAIT_COUNT=$((WAIT_COUNT + 1))
    sleep 1
  done
  
  if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo "WARNING: Xvfb readiness check timed out, but continuing anyway..."
    echo "Xvfb log:"
    cat /tmp/xvfb.log || true
  fi
  
  # Verify Xvfb process is still running
  if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb process died unexpectedly"
    cat /tmp/xvfb.log || true
    exit 1
  fi
  
  echo "Xvfb started successfully (PID: $XVFB_PID)"
else
  echo "Xvfb is disabled (XVFB_ENABLED=false)"
fi

# Start Node.js application
echo "Starting Node.js application..."
node dist/main.js &
NODE_PID=$!

# Wait for Node.js process to exit
wait $NODE_PID
EXIT_CODE=$?

# Cleanup on exit (if Node.js exits normally)
cleanup

exit $EXIT_CODE

