#!/bin/bash
set -e

# Variables
# You should change this password!
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-password}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-user}"
CLICKHOUSE_DB="${CLICKHOUSE_DB:-db}"

echo "Deploying ClickHouse..."

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Create data directory
mkdir -p clickhouse_data

# Run ClickHouse Container
# We expose 8123 (HTTP) and 9000 (Native)
# We use the official image
if [ ! "$(docker ps -q -f name=clickhouse-server)" ]; then
    if [ "$(docker ps -aq -f name=clickhouse-server)" ]; then
        echo "Removing existing stopped container..."
        docker rm clickhouse-server
    fi
    
    echo "Starting ClickHouse container..."
    docker run -d \
        --name clickhouse-server \
        --ulimit nofile=262144:262144 \
        -p 8123:8123 \
        -p 9000:9000 \
        -e CLICKHOUSE_DB=$CLICKHOUSE_DB \
        -e CLICKHOUSE_USER=$CLICKHOUSE_USER \
        -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 \
        -e CLICKHOUSE_PASSWORD=$CLICKHOUSE_PASSWORD \
        --volume=$PWD/clickhouse_data:/var/lib/clickhouse \
        --restart unless-stopped \
        clickhouse/clickhouse-server
else
    echo "ClickHouse container is already running."
fi

# Wait for ClickHouse to start
echo "Waiting for ClickHouse to be ready..."
until curl -sS "http://localhost:8123/ping" > /dev/null; do
    sleep 1
done

echo "ClickHouse is ready."

# Apply Schema
if [ -f "setup_clickhouse.sql" ]; then
    echo "Applying schema from setup_clickhouse.sql..."
    cat setup_clickhouse.sql | docker exec -i clickhouse-server clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" --multiquery
    echo "Schema applied."
else
    echo "Warning: setup_clickhouse.sql not found. Skipping schema application."
fi

echo "----------------------------------------"
echo "Deployment complete!"
echo "Connection details:"
echo "Host: $(curl -s ifconfig.me)"
echo "HTTP Port: 8123"
echo "Native Port: 9000"
echo "User: $CLICKHOUSE_USER"
echo "Password: $CLICKHOUSE_PASSWORD"
echo "Database: $CLICKHOUSE_DB"
echo "----------------------------------------"
