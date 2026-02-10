import dgram from "dgram";
import http from "http";
import os from "os";

const MDNS_PORT = 5353;
const MDNS_ADDRESS = "224.0.0.251";

interface MDNSAdvertisement {
  hostname: string; // e.g., "my-tunnel.local"
  port: number;
  ip: string;
}

/**
 * Simple mDNS responder that advertises a .local hostname
 * This allows other devices on the LAN to discover and access the tunnel
 */
export class MDNSAdvertiser {
  private socket: dgram.Socket | null = null;
  private hostname: string;
  private port: number;
  private ip: string;
  private running = false;

  constructor(hostname: string, port: number) {
    // Ensure hostname ends with .local
    this.hostname = hostname.endsWith(".local")
      ? hostname
      : `${hostname}.local`;
    this.port = port;
    this.ip = this.getLocalIP();
  }

  /**
   * Get the primary local IP address
   */
  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netInterfaces = interfaces[name];
      if (!netInterfaces) continue;

      for (const net of netInterfaces) {
        // Skip internal and non-IPv4 addresses
        if (!net.internal && net.family === "IPv4") {
          return net.address;
        }
      }
    }
    return "127.0.0.1";
  }

  /**
   * Start advertising the hostname via mDNS
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.running) {
        resolve();
        return;
      }

      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        console.error("mDNS socket error:", err.message);
        this.stop();
      });

      this.socket.on("message", (msg, rinfo) => {
        this.handleQuery(msg, rinfo);
      });

      // Bind to all interfaces (0.0.0.0) to receive multicast from other devices
      this.socket.bind(MDNS_PORT, "0.0.0.0", () => {
        try {
          // Join multicast group on all interfaces
          this.socket?.addMembership(MDNS_ADDRESS, this.ip);
          this.socket?.setMulticastTTL(255);
          this.socket?.setMulticastLoopback(true);
          this.running = true;

          // Send initial announcement
          this.announce();

          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Stop advertising
   */
  stop(): void {
    if (this.socket) {
      try {
        this.socket.dropMembership(MDNS_ADDRESS);
      } catch {
        // Ignore errors when dropping membership
      }
      this.socket.close();
      this.socket = null;
    }
    this.running = false;
  }

  /**
   * Handle incoming mDNS queries
   */
  private handleQuery(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Parse the DNS query to check if it's asking for our hostname
    try {
      const query = this.parseDNSQuery(msg);
      if (query && query.toLowerCase() === this.hostname.toLowerCase()) {
        this.sendResponse(rinfo);
      }
    } catch {
      // Ignore malformed queries
    }
  }

  /**
   * Parse a DNS query to extract the queried name
   */
  private parseDNSQuery(msg: Buffer): string | null {
    if (msg.length < 12) return null;

    // Check if it's a query (QR bit = 0)
    const flags = msg.readUInt16BE(2);
    if ((flags & 0x8000) !== 0) return null; // It's a response, not a query

    const qdcount = msg.readUInt16BE(4);
    if (qdcount < 1) return null;

    // Parse the first question
    let offset = 12;
    const labels: string[] = [];

    while (offset < msg.length) {
      const len = msg[offset];
      if (len === 0) break;
      offset++;
      if (offset + len > msg.length) return null;
      labels.push(msg.slice(offset, offset + len).toString("ascii"));
      offset += len;
    }

    return labels.join(".");
  }

  /**
   * Send an mDNS response with our IP
   */
  private sendResponse(rinfo?: dgram.RemoteInfo): void {
    const response = this.buildDNSResponse();
    if (this.socket && this.running) {
      // Always multicast the response so all devices can see it
      this.socket.send(response, 0, response.length, MDNS_PORT, MDNS_ADDRESS);
    }
  }

  /**
   * Announce our presence - send multiple announcements for reliability
   */
  private announce(): void {
    this.sendResponse();
    // Send announcements at increasing intervals for reliability
    setTimeout(() => this.sendResponse(), 500);
    setTimeout(() => this.sendResponse(), 1000);
    setTimeout(() => this.sendResponse(), 2000);
    setTimeout(() => this.sendResponse(), 5000);

    // Keep announcing periodically while running
    const announceInterval = setInterval(() => {
      if (this.running) {
        this.sendResponse();
      } else {
        clearInterval(announceInterval);
      }
    }, 30000); // Re-announce every 30 seconds
  }

  /**
   * Build a DNS response packet
   */
  private buildDNSResponse(): Buffer {
    const labels = this.hostname.split(".");
    const nameLength = labels.reduce((sum, l) => sum + 1 + l.length, 1);

    // Header (12 bytes) + Name + Type (2) + Class (2) + TTL (4) + Data Length (2) + IP (4)
    const bufferLength = 12 + nameLength + 2 + 2 + 4 + 2 + 4;
    const buffer = Buffer.alloc(bufferLength);

    let offset = 0;

    // Transaction ID (0)
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // Flags: Response (0x8400 = response, authoritative)
    buffer.writeUInt16BE(0x8400, offset);
    offset += 2;

    // QDCOUNT (0)
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // ANCOUNT (1)
    buffer.writeUInt16BE(1, offset);
    offset += 2;

    // NSCOUNT (0)
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // ARCOUNT (0)
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    // Answer section
    // Name
    for (const label of labels) {
      buffer.writeUInt8(label.length, offset);
      offset++;
      buffer.write(label, offset, "ascii");
      offset += label.length;
    }
    buffer.writeUInt8(0, offset); // End of name
    offset++;

    // Type: A (1)
    buffer.writeUInt16BE(1, offset);
    offset += 2;

    // Class: IN (1) with cache-flush bit set (0x8001)
    buffer.writeUInt16BE(0x8001, offset);
    offset += 2;

    // TTL: 120 seconds
    buffer.writeUInt32BE(120, offset);
    offset += 4;

    // Data length: 4 (IPv4)
    buffer.writeUInt16BE(4, offset);
    offset += 2;

    // IP address
    const ipParts = this.ip.split(".").map(Number);
    for (const part of ipParts) {
      buffer.writeUInt8(part, offset);
      offset++;
    }

    return buffer;
  }

  /**
   * Get the advertised info
   */
  getInfo(): MDNSAdvertisement {
    return {
      hostname: this.hostname,
      port: this.port,
      ip: this.ip,
    };
  }
}

/**
 * Local HTTP proxy that listens on port 80 and forwards to the target port.
 * Allows accessing the tunnel via http://subdomain.local without specifying a port.
 * Requires elevated privileges (sudo) to bind to port 80.
 */
export class LocalProxy {
  private server: http.Server | null = null;
  private targetPort: number;
  private running = false;

  constructor(targetPort: number) {
    this.targetPort = targetPort;
  }

  /**
   * Start the proxy server on port 80
   */
  start(): Promise<boolean> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const options: http.RequestOptions = {
          hostname: "localhost",
          port: this.targetPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on("error", (err) => {
          res.writeHead(502);
          res.end(`Proxy error: ${err.message}`);
        });

        req.pipe(proxyReq);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EACCES") {
          // Port 80 requires elevated privileges
          resolve(false);
        } else if (err.code === "EADDRINUSE") {
          // Port 80 is already in use
          resolve(false);
        } else {
          resolve(false);
        }
      });

      this.server.listen(80, "0.0.0.0", () => {
        this.running = true;
        resolve(true);
      });
    });
  }

  /**
   * Stop the proxy server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
