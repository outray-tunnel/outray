import dgram from "dgram";
import http from "http";
import https from "https";
import os from "os";

const MDNS_PORT = 5353;
const MDNS_ADDRESS = "224.0.0.251";

interface MDNSAdvertisement {
  hostname: string;
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
  private announceInterval: NodeJS.Timeout | null = null;

  constructor(hostname: string, port: number) {
    this.hostname = hostname.endsWith(".local")
      ? hostname
      : `${hostname}.local`;
    this.port = port;
    this.ip = this.getLocalIP();
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netInterfaces = interfaces[name];
      if (!netInterfaces) continue;

      for (const net of netInterfaces) {
        if (!net.internal && net.family === "IPv4") {
          return net.address;
        }
      }
    }
    return "127.0.0.1";
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.running) {
        resolve();
        return;
      }

      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        this.stop();
      });

      this.socket.on("message", (msg, rinfo) => {
        this.handleQuery(msg, rinfo);
      });

      this.socket.bind(MDNS_PORT, "0.0.0.0", () => {
        try {
          this.socket?.addMembership(MDNS_ADDRESS, this.ip);
          this.socket?.setMulticastTTL(255);
          this.socket?.setMulticastLoopback(true);
          this.running = true;
          this.announce();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  stop(): void {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
    if (this.socket) {
      try {
        this.socket.dropMembership(MDNS_ADDRESS);
      } catch {
        // Ignore
      }
      this.socket.close();
      this.socket = null;
    }
    this.running = false;
  }

  private handleQuery(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const query = this.parseDNSQuery(msg);
      if (query && query.toLowerCase() === this.hostname.toLowerCase()) {
        this.sendResponse();
      }
    } catch {
      // Ignore malformed queries
    }
  }

  private parseDNSQuery(msg: Buffer): string | null {
    if (msg.length < 12) return null;

    const flags = msg.readUInt16BE(2);
    if ((flags & 0x8000) !== 0) return null;

    const qdcount = msg.readUInt16BE(4);
    if (qdcount < 1) return null;

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

  private sendResponse(): void {
    const response = this.buildDNSResponse();
    if (this.socket && this.running) {
      this.socket.send(response, 0, response.length, MDNS_PORT, MDNS_ADDRESS);
    }
  }

  private announce(): void {
    this.sendResponse();
    setTimeout(() => this.sendResponse(), 500);
    setTimeout(() => this.sendResponse(), 1000);
    setTimeout(() => this.sendResponse(), 2000);

    this.announceInterval = setInterval(() => {
      if (this.running) {
        this.sendResponse();
      }
    }, 30000);
  }

  private buildDNSResponse(): Buffer {
    const labels = this.hostname.split(".");
    const nameLength = labels.reduce((sum, l) => sum + 1 + l.length, 1);
    const bufferLength = 12 + nameLength + 2 + 2 + 4 + 2 + 4;
    const buffer = Buffer.alloc(bufferLength);

    let offset = 0;

    buffer.writeUInt16BE(0, offset);
    offset += 2;
    buffer.writeUInt16BE(0x8400, offset);
    offset += 2;
    buffer.writeUInt16BE(0, offset);
    offset += 2;
    buffer.writeUInt16BE(1, offset);
    offset += 2;
    buffer.writeUInt16BE(0, offset);
    offset += 2;
    buffer.writeUInt16BE(0, offset);
    offset += 2;

    for (const label of labels) {
      buffer.writeUInt8(label.length, offset);
      offset++;
      buffer.write(label, offset, "ascii");
      offset += label.length;
    }
    buffer.writeUInt8(0, offset);
    offset++;

    buffer.writeUInt16BE(1, offset);
    offset += 2;
    buffer.writeUInt16BE(0x8001, offset);
    offset += 2;
    buffer.writeUInt32BE(120, offset);
    offset += 4;
    buffer.writeUInt16BE(4, offset);
    offset += 2;

    const ipParts = this.ip.split(".").map(Number);
    for (const part of ipParts) {
      buffer.writeUInt8(part, offset);
      offset++;
    }

    return buffer;
  }

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
 */
export class LocalProxy {
  private server: http.Server | null = null;
  private targetPort: number;
  private running = false;

  constructor(targetPort: number) {
    this.targetPort = targetPort;
  }

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

      this.server.on("error", () => {
        resolve(false);
      });

      this.server.listen(80, "0.0.0.0", () => {
        this.running = true;
        resolve(true);
      });
    });
  }

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

/**
 * Local HTTPS proxy that listens on port 443 and forwards to the target port.
 */
export class LocalHttpsProxy {
  private server: https.Server | null = null;
  private targetPort: number;
  private hostname: string;
  private running = false;
  private _isTrusted = false;

  constructor(targetPort: number, hostname: string) {
    this.targetPort = targetPort;
    this.hostname = hostname;
  }

  get isTrusted(): boolean {
    return this._isTrusted;
  }

  async start(): Promise<boolean> {
    return new Promise((resolve) => {
      this.generateCert()
        .then((creds) => {
          if (!creds) {
            resolve(false);
            return;
          }

          this._isTrusted = creds.trusted;

          this.server = https.createServer(
            { key: creds.key, cert: creds.cert },
            (req, res) => {
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
            },
          );

          this.server.on("error", () => {
            resolve(false);
          });

          this.server.listen(443, "0.0.0.0", () => {
            this.running = true;
            resolve(true);
          });
        })
        .catch(() => resolve(false));
    });
  }

  private generateCert(): Promise<{
    key: string;
    cert: string;
    trusted: boolean;
  } | null> {
    return new Promise((resolve) => {
      const { execSync } = require("child_process");
      const fs = require("fs");
      const os = require("os");
      const path = require("path");

      const tmpDir = os.tmpdir();
      const keyFile = path.join(tmpDir, `outray-${Date.now()}-key.pem`);
      const certFile = path.join(tmpDir, `outray-${Date.now()}.pem`);

      // Try mkcert first
      try {
        execSync("which mkcert", { stdio: "pipe" });
        execSync(
          `mkcert -key-file "${keyFile}" -cert-file "${certFile}" "${this.hostname}"`,
          { stdio: "pipe" },
        );

        const key = fs.readFileSync(keyFile, "utf8");
        const cert = fs.readFileSync(certFile, "utf8");
        fs.unlinkSync(keyFile);
        fs.unlinkSync(certFile);

        resolve({ key, cert, trusted: true });
        return;
      } catch {
        // Fall back to openssl
      }

      try {
        execSync(
          `openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/CN=${this.hostname}" -addext "subjectAltName=DNS:${this.hostname}"`,
          { stdio: "pipe" },
        );

        const key = fs.readFileSync(keyFile, "utf8");
        const cert = fs.readFileSync(certFile, "utf8");
        fs.unlinkSync(keyFile);
        fs.unlinkSync(certFile);

        resolve({ key, cert, trusted: false });
      } catch {
        resolve(null);
      }
    });
  }

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

export interface LocalAccessInfo {
  hostname: string;
  ip: string;
  port: number;
  httpUrl?: string;
  httpsUrl?: string;
  httpsIsTrusted?: boolean;
}

/**
 * Manages local LAN access via mDNS and optional HTTP/HTTPS proxies
 */
export class LocalAccessManager {
  private mdnsAdvertiser: MDNSAdvertiser | null = null;
  private localProxy: LocalProxy | null = null;
  private localHttpsProxy: LocalHttpsProxy | null = null;
  private port: number;
  private subdomain: string;

  constructor(port: number, subdomain: string) {
    this.port = port;
    this.subdomain = subdomain;
  }

  async start(): Promise<LocalAccessInfo> {
    const hostname = `${this.subdomain}.local`;

    // Start mDNS
    this.mdnsAdvertiser = new MDNSAdvertiser(this.subdomain, this.port);
    await this.mdnsAdvertiser.start();
    const info = this.mdnsAdvertiser.getInfo();

    const result: LocalAccessInfo = {
      hostname: info.hostname,
      ip: info.ip,
      port: this.port,
    };

    // Try HTTPS proxy (port 443)
    this.localHttpsProxy = new LocalHttpsProxy(this.port, hostname);
    const httpsStarted = await this.localHttpsProxy.start();
    if (httpsStarted) {
      result.httpsUrl = `https://${hostname}`;
      result.httpsIsTrusted = this.localHttpsProxy.isTrusted;
    }

    // Try HTTP proxy (port 80)
    this.localProxy = new LocalProxy(this.port);
    const httpStarted = await this.localProxy.start();
    if (httpStarted) {
      result.httpUrl = `http://${hostname}`;
    }

    return result;
  }

  stop(): void {
    if (this.localHttpsProxy) {
      this.localHttpsProxy.stop();
      this.localHttpsProxy = null;
    }
    if (this.localProxy) {
      this.localProxy.stop();
      this.localProxy = null;
    }
    if (this.mdnsAdvertiser) {
      this.mdnsAdvertiser.stop();
      this.mdnsAdvertiser = null;
    }
  }
}
