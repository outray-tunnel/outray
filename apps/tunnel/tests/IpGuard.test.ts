import { describe, it, expect } from "vitest";
import { IpGuard } from "../src/lib/IpGuard";

describe("IpGuard", () => {
  describe("normalizeIp", () => {
    it("should return IPv4 as is", () => {
      expect(IpGuard.normalizeIp("1.2.3.4")).toBe("1.2.3.4");
    });

    it("should normalize IPv4-mapped IPv6", () => {
      expect(IpGuard.normalizeIp("::ffff:1.2.3.4")).toBe("1.2.3.4");
    });

    it("should normalize localhost IPv6", () => {
      expect(IpGuard.normalizeIp("::1")).toBe("127.0.0.1");
    });

    it("should handle x-forwarded-for format", () => {
      expect(IpGuard.normalizeIp("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
    });

    it("should handle empty or null", () => {
      expect(IpGuard.normalizeIp("")).toBe("0.0.0.0");
      expect(IpGuard.normalizeIp(null)).toBe("0.0.0.0");
    });
  });

  describe("isAllowed", () => {
    it("should allow everything if allowlist is empty", () => {
      expect(IpGuard.isAllowed("1.2.3.4", [])).toBe(true);
      expect(IpGuard.isAllowed("1.2.3.4", undefined)).toBe(true);
    });

    it("should allow exact IP match", () => {
      const allowlist = ["1.2.3.4", "5.6.7.8"];
      expect(IpGuard.isAllowed("1.2.3.4", allowlist)).toBe(true);
      expect(IpGuard.isAllowed("5.6.7.8", allowlist)).toBe(true);
    });

    it("should deny non-matching IP", () => {
      const allowlist = ["1.2.3.4"];
      expect(IpGuard.isAllowed("5.6.7.8", allowlist)).toBe(false);
    });

    it("should allow CIDR range match", () => {
      const allowlist = ["10.0.0.0/8"];
      expect(IpGuard.isAllowed("10.0.0.1", allowlist)).toBe(true);
      expect(IpGuard.isAllowed("10.255.255.255", allowlist)).toBe(true);
    });

    it("should deny outside CIDR range", () => {
      const allowlist = ["10.0.0.0/8"];
      expect(IpGuard.isAllowed("11.0.0.1", allowlist)).toBe(false);
    });

    it("should normalize IP before checking", () => {
      const allowlist = ["127.0.0.1"];
      expect(IpGuard.isAllowed("::1", allowlist)).toBe(true);
    });

    it("should handle mixed allowlist", () => {
      const allowlist = ["1.2.3.4", "192.168.0.0/16"];
      expect(IpGuard.isAllowed("1.2.3.4", allowlist)).toBe(true);
      expect(IpGuard.isAllowed("192.168.1.1", allowlist)).toBe(true);
      expect(IpGuard.isAllowed("8.8.8.8", allowlist)).toBe(false);
    });
  });
});
