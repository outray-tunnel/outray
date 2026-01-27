#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <base_url>"
  echo "Example: $0 https://dangerous-sea.outray.app"
  exit 1
fi

BASE_URL="$1"

echo "=== Testing all endpoints ==="
echo "Base URL: $BASE_URL"
echo ""

echo "1. GET /"
curl -s "$BASE_URL/"
echo -e "\n"

echo "2. GET /users"
curl -s "$BASE_URL/users"
echo -e "\n"

echo "3. POST /users (create user)"
curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dave","email":"dave@example.com"}'
echo -e "\n"

echo "4. GET /users/1"
curl -s "$BASE_URL/users/1"
echo -e "\n"

echo "5. PUT /users/1 (update user)"
curl -s -X PUT "$BASE_URL/users/1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Updated","email":"alice.new@example.com"}'
echo -e "\n"

echo "6. DELETE /users/2"
curl -s -X DELETE "$BASE_URL/users/2" -w "Status: %{http_code}"
echo -e "\n"

echo "7. GET /posts?page=2&limit=5"
curl -s "$BASE_URL/posts?page=2&limit=5"
echo -e "\n"

echo "8. POST /echo"
curl -s -X POST "$BASE_URL/echo" \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: test-value" \
  -d '{"test":"data","nested":{"key":"value"}}'
echo -e "\n"

echo "9. POST /upload"
curl -s -X POST "$BASE_URL/upload" \
  -H "Content-Type: application/octet-stream" \
  -d "This is some file content to upload for testing purposes"
echo -e "\n"

echo "10. GET /headers"
curl -s "$BASE_URL/headers" \
  -H "Authorization: Bearer test-token-123" \
  -H "X-Custom-Header: my-custom-value"
echo -e "\n"

echo "11. GET /html"
curl -s "$BASE_URL/html"
echo -e "\n"

echo "12. GET /text"
curl -s "$BASE_URL/text"
echo -e "\n"

echo "13. GET /error/400"
curl -s "$BASE_URL/error/400"
echo -e "\n"

echo "14. GET /error/401"
curl -s "$BASE_URL/error/401"
echo -e "\n"

echo "15. GET /error/403"
curl -s "$BASE_URL/error/403"
echo -e "\n"

echo "16. GET /error/404"
curl -s "$BASE_URL/error/404"
echo -e "\n"

echo "17. GET /error/500"
curl -s "$BASE_URL/error/500"
echo -e "\n"

echo "18. GET /slow (2s delay)"
curl -s "$BASE_URL/slow"
echo -e "\n"

echo "19. GET /nonexistent (404)"
curl -s "$BASE_URL/nonexistent"
echo -e "\n"

echo "=== Done ==="
