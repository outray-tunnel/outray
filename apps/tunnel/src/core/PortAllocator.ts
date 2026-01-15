/**
 * O(1) port allocator using a free port pool.
 * Instead of linear search, maintains a set of available ports.
 */
export class PortAllocator {
  private availablePorts: number[] = [];
  private usedPorts = new Set<number>();
  private min: number;
  private max: number;

  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
    // Initialize with all ports available (lazy - we shuffle on first access)
    this.initializePorts();
  }

  private initializePorts(): void {
    // Create array of all ports and shuffle for random distribution
    const ports: number[] = [];
    for (let p = this.min; p <= this.max; p++) {
      ports.push(p);
    }
    // Fisher-Yates shuffle for random port assignment
    for (let i = ports.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ports[i], ports[j]] = [ports[j], ports[i]];
    }
    this.availablePorts = ports;
  }

  allocate(requestedPort?: number): number | null {
    if (requestedPort !== undefined) {
      if (this.usedPorts.has(requestedPort)) {
        return null; // Already in use
      }
      if (!Number.isFinite(requestedPort) || !Number.isInteger(requestedPort)) {
        return null;
      }
      if (requestedPort < this.min || requestedPort > this.max) {
        return null; // Out of range
      }

      const idx = this.availablePorts.indexOf(requestedPort);
      if (idx !== -1) {
        this.availablePorts.splice(idx, 1);
      }
      this.usedPorts.add(requestedPort);
      return requestedPort;
    }

    while (this.availablePorts.length > 0) {
      const port = this.availablePorts.pop()!;
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    return null;
  }

  release(port: number): void {
    if (this.usedPorts.has(port)) {
      this.usedPorts.delete(port);
      this.availablePorts.push(port);
    }
  }

  isInUse(port: number): boolean {
    return this.usedPorts.has(port);
  }

  availableCount(): number {
    return this.availablePorts.length;
  }

  usedCount(): number {
    return this.usedPorts.size;
  }
}
