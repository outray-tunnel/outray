#!/usr/bin/env python3
"""Forward selected Docker service logs to an OutRay OTLP/HTTP endpoint.

Only explicitly named long-running containers are read. Build-step containers
are deliberately excluded because their stdout can contain secret material.
"""

import argparse
import datetime
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

URL = re.compile(r"https?://[^\s<>\"']+")
BEARER = re.compile(r"(?i)\bBearer\s+[^\s\"']+")
SENSITIVE_KEY = (r"[A-Za-z0-9_-]*(?:api[_-]?key|authorization|cookie|password|secret|"
                 r"token|database[_-]?url|dsn|connection[_-]?string)[A-Za-z0-9_-]*")
JSON_ASSIGNMENT = re.compile(
    rf'(?i)"({SENSITIVE_KEY})"\s*:\s*(?:"(?:\\.|[^"\\])*"|[^,\s}}]+)'
)
ASSIGNMENT = re.compile(
    rf"(?i)\b({SENSITIVE_KEY})\s*([:=])\s*"
    r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)"
)
KNOWN_TOKEN = re.compile(r"\b(?:outray|unbe)_[A-Za-z0-9_-]{20,}\b")
TIMESTAMP = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s+(.*)$")


def redact(message: str) -> str:
    message = URL.sub(lambda match: match.group().split("?", 1)[0].split("#", 1)[0], message)
    message = BEARER.sub("Bearer [REDACTED]", message)
    message = JSON_ASSIGNMENT.sub(lambda match: f'"{match.group(1)}":"[REDACTED]"', message)
    message = ASSIGNMENT.sub(lambda match: f"{match.group(1)}{match.group(2)}[REDACTED]", message)
    message = KNOWN_TOKEN.sub("[REDACTED]", message)
    return message[:4096]


def unix_nanos(value: str) -> str:
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return str(int(parsed.timestamp() * 1_000_000_000))
    except ValueError:
        return str(time.time_ns())


def otlp_batch(events: list[tuple[str, str, str]]) -> bytes:
    groups: dict[str, list[dict]] = {}
    for service, timestamp, message in events:
        level = 17 if re.search(r"\b(error|fatal)\b", message, re.I) else (
            13 if re.search(r"\bwarn(?:ing)?\b", message, re.I) else 9
        )
        groups.setdefault(service, []).append({
            "timeUnixNano": unix_nanos(timestamp),
            "severityNumber": level,
            "severityText": "ERROR" if level == 17 else "WARN" if level == 13 else "INFO",
            "body": {"stringValue": redact(message)},
        })
    payload = {"resourceLogs": [{
        "resource": {"attributes": [
            {"key": "service.name", "value": {"stringValue": service}},
            {"key": "deployment.environment.name", "value": {"stringValue": "production"}},
        ]},
        "scopeLogs": [{"scope": {"name": "outray.docker-log-forwarder"}, "logRecords": records}],
    } for service, records in groups.items()]}
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def follow(container: str, service: str, pending: queue.Queue) -> None:
    while True:
        try:
            process = subprocess.Popen(
                ["docker", "logs", "--follow", "--since", "10s", "--timestamps", container],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
            )
            assert process.stdout is not None
            for line in process.stdout:
                match = TIMESTAMP.match(line.rstrip("\n"))
                if match:
                    try:
                        pending.put_nowait((service, match.group(1), match.group(2)))
                    except queue.Full:
                        print("Ops log queue full; dropping newest line", file=sys.stderr, flush=True)
            process.wait()
        except OSError:
            print(f"Could not read Docker logs for {container}", file=sys.stderr, flush=True)
        time.sleep(3)


def heartbeat(container: str, service: str, pending: queue.Queue) -> None:
    while True:
        try:
            result = subprocess.run(
                ["docker", "inspect", "--format", "{{.State.Running}}", container],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            running = result.returncode == 0 and result.stdout.strip() == "true"
        except (OSError, subprocess.TimeoutExpired):
            running = False
        if running:
            try:
                pending.put_nowait((service, datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"), "outray_service_heartbeat"))
            except queue.Full:
                pass
        time.sleep(60)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", action="append", required=True, metavar="NAME=SERVICE")
    args = parser.parse_args()
    endpoint = os.environ.get("OPS_OTLP_ENDPOINT", "")
    token = os.environ.get("OPS_OTLP_TOKEN", "")
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/") \
            or parsed.username or parsed.password or parsed.query or parsed.fragment or not token:
        parser.error("OPS_OTLP_ENDPOINT must be an HTTPS origin and OPS_OTLP_TOKEN must be set")
    destination = endpoint.rstrip("/") + "/v1/logs"
    pending: queue.Queue[tuple[str, str, str]] = queue.Queue(maxsize=2000)
    for item in args.container:
        if "=" not in item:
            parser.error("--container must be NAME=SERVICE")
        container, service = item.split("=", 1)
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", container) or not re.fullmatch(r"[A-Za-z0-9_.-]+", service):
            parser.error("container and service names must be simple identifiers")
        threading.Thread(target=follow, args=(container, service, pending), daemon=True).start()
        threading.Thread(target=heartbeat, args=(container, service, pending), daemon=True).start()

    while True:
        first = pending.get()
        batch = [first]
        deadline = time.monotonic() + 2
        while len(batch) < 100:
            try:
                batch.append(pending.get(timeout=max(0, deadline - time.monotonic())))
            except queue.Empty:
                break
        request = urllib.request.Request(
            destination,
            data=otlp_batch(batch),
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError("OTLP rejected log batch")
        except (urllib.error.URLError, TimeoutError, RuntimeError) as error:
            print(f"Ops log export failed ({type(error).__name__}); retrying", file=sys.stderr, flush=True)
            time.sleep(5)
            for item in batch:
                try:
                    pending.put_nowait(item)
                except queue.Full:
                    break


if __name__ == "__main__":
    main()
