#!/bin/bash

# Start script for Supabase MCP Server with nginx + supergateway architecture

set -e

echo "Starting Supabase MCP Server..."

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ]; then
    echo "Error: SUPABASE_URL environment variable is not set"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_SECRET" ]; then
    echo "Error: SUPABASE_SERVICE_ROLE_SECRET environment variable is not set"
    exit 1
fi

# Set default MCP_AUTH_TOKEN if not provided
if [ -z "$MCP_AUTH_TOKEN" ]; then
    export MCP_AUTH_TOKEN="default-token-change-in-production"
    echo "Warning: Using default MCP_AUTH_TOKEN. Please set a secure token in production."
fi

echo "Configuration:"
echo "  - Supabase URL: $SUPABASE_URL"
echo "  - Using Auth Token: ${MCP_AUTH_TOKEN:0:10}..."
echo "  - Service Role Secret: Set"

# Replace environment variables in nginx configuration
echo "Configuring nginx..."
envsubst '${MCP_AUTH_TOKEN}' < /etc/nginx/nginx.conf > /tmp/nginx.conf
mv /tmp/nginx.conf /etc/nginx/nginx.conf

# Test nginx configuration
nginx -t

# Start nginx in the background
echo "Starting nginx on port 8080..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait a moment for nginx to start
sleep 2

# Check if nginx is running
if ! kill -0 $NGINX_PID 2>/dev/null; then
    echo "Error: nginx failed to start"
    exit 1
fi

echo "nginx started successfully (PID: $NGINX_PID)"

# Test Supabase connection
echo "Testing Supabase connection..."
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
client.from('').select('').then(() => {
    console.log('✓ Supabase connection successful');
}).catch(err => {
    console.error('✗ Supabase connection failed:', err.message);
    process.exit(1);
});
"

# Start supergateway on port 8081
echo "Starting supergateway on port 8081..."
echo "MCP service command: node dist/index.js"

# Function to handle shutdown
shutdown() {
    echo "Shutting down services..."
    if [ -n "$NGINX_PID" ]; then
        kill $NGINX_PID 2>/dev/null || true
    fi
    if [ -n "$SUPERGATEWAY_PID" ]; then
        kill $SUPERGATEWAY_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Start supergateway (this will block)
exec supergateway --port 8081 --stdio 'node dist/index.js 2>&1'