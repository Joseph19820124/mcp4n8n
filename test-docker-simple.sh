#!/bin/bash

echo "🧪 Testing Google API MCP Server in Docker"
echo "============================================"

AUTH_TOKEN="test-token-12345-google-api"
BASE_URL="http://localhost:8080"

echo ""
echo "1️⃣ Testing authentication (should fail)..."
curl -s -w "\nHTTP Status: %{http_code}\n" $BASE_URL/sse | head -2

echo ""
echo "2️⃣ Testing with valid auth token..."
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Accept: text/event-stream" \
  $BASE_URL/sse | head -3

echo ""
echo "3️⃣ Testing via direct MCP message (after establishing session)..."
# Get session ID from SSE endpoint
SESSION_RESPONSE=$(curl -s -H "Authorization: Bearer $AUTH_TOKEN" -H "Accept: text/event-stream" $BASE_URL/sse | head -2)
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o 'sessionId=[^&]*' | cut -d'=' -f2)

if [ ! -z "$SESSION_ID" ]; then
    echo "🔑 Got session ID: $SESSION_ID"
    
    # Wait a moment for session to initialize
    sleep 2
    
    # Test tools/list
    echo ""
    echo "🛠️ Testing tools/list..."
    curl -s -X POST \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' \
      "$BASE_URL/message?sessionId=$SESSION_ID" | jq '.result.tools[0].name' 2>/dev/null || echo "Response received (jq not available for formatting)"
    
    # Test get_quota_status
    echo ""
    echo "📊 Testing get_quota_status tool..."
    curl -s -X POST \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_quota_status","arguments":{}},"id":3}' \
      "$BASE_URL/message?sessionId=$SESSION_ID" | head -5
else
    echo "❌ Could not extract session ID"
fi

echo ""
echo "✅ Testing complete!"