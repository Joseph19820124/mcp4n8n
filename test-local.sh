#!/bin/bash

# Test script for MCP servers locally

echo "MCP Server Local Testing Script"
echo "==============================="

# Function to test a server
test_server() {
    local server_name=$1
    local server_dir=$2
    local test_endpoint=$3
    
    echo ""
    echo "Testing $server_name..."
    echo "------------------------"
    
    # Check if .env exists
    if [ ! -f "$server_dir/.env" ]; then
        echo "❌ Missing .env file in $server_dir"
        echo "   Please create a .env file with required variables"
        return 1
    fi
    
    # Start the server
    echo "Starting $server_name server..."
    cd "$server_dir"
    npm start &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 5
    
    # Test the server
    echo "Testing endpoint: $test_endpoint"
    
    # Check if MCP_AUTH_TOKEN is set
    if [ -z "$MCP_AUTH_TOKEN" ]; then
        echo "❌ MCP_AUTH_TOKEN not set. Using test token."
        MCP_AUTH_TOKEN="test-token-12345"
    fi
    
    # Test health endpoint
    echo "Testing health endpoint..."
    curl -s -w "\nHTTP Status: %{http_code}\n" \
         -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
         http://localhost:8080/health
    
    # Test SSE endpoint
    echo ""
    echo "Testing SSE endpoint..."
    timeout 3 curl -s -N \
         -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
         -H "Accept: text/event-stream" \
         http://localhost:8080/sse || true
    
    # Kill the server
    echo ""
    echo "Stopping server..."
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    
    cd ..
}

# Function to create example .env files
create_env_examples() {
    echo "Creating .env.example files..."
    
    # YouTube MCP
    cat > youtube-mcp/.env.example << 'EOF'
# YouTube MCP Environment Variables
YOUTUBE_API_KEY=your-youtube-api-key-here
MCP_AUTH_TOKEN=your-secure-token-here
PORT=8080
EOF

    # Web Scraper MCP
    cat > web-scraper-mcp/.env.example << 'EOF'
# Web Scraper MCP Environment Variables
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
GITHUB_BRANCH=main
GITHUB_TOKEN=your-github-token-here
MCP_AUTH_TOKEN=your-secure-token-here
PORT=8080
EOF

    # PDF Generator MCP
    cat > pdf-generator-mcp/.env.example << 'EOF'
# PDF Generator MCP Environment Variables
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
GITHUB_BRANCH=main
GITHUB_TOKEN=your-github-token-here
PDF_BASE_PATH=pdfs
MCP_AUTH_TOKEN=your-secure-token-here
PORT=8080
EOF

    echo "✅ Created .env.example files"
}

# Main execution
echo ""
echo "Checking environment setup..."

# Create .env.example files
create_env_examples

# Check for .env files
echo ""
echo "Checking for .env files..."
for dir in youtube-mcp web-scraper-mcp pdf-generator-mcp; do
    if [ -f "$dir/.env" ]; then
        echo "✅ Found .env in $dir"
    else
        echo "❌ Missing .env in $dir (copy from .env.example and fill in values)"
    fi
done

# Ask user which server to test
echo ""
echo "Which server would you like to test?"
echo "1) YouTube MCP"
echo "2) Web Scraper MCP"
echo "3) PDF Generator MCP"
echo "4) All servers"
echo "5) Exit"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        test_server "YouTube MCP" "youtube-mcp" "/sse"
        ;;
    2)
        test_server "Web Scraper MCP" "web-scraper-mcp" "/sse"
        ;;
    3)
        test_server "PDF Generator MCP" "pdf-generator-mcp" "/sse"
        ;;
    4)
        test_server "YouTube MCP" "youtube-mcp" "/sse"
        test_server "Web Scraper MCP" "web-scraper-mcp" "/sse"
        test_server "PDF Generator MCP" "pdf-generator-mcp" "/sse"
        ;;
    5)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac

echo ""
echo "Testing complete!"