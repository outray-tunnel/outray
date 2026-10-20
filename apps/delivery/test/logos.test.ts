import assert from "node:assert/strict";
import test from "node:test";
import jpegImage from "../../../shared/jpeg-image";
import jpegFixtures from "../../../shared/test/fixtures/jpeg";
import {
  handleRequest,
  logoKey,
  MAX_LOGO_BYTES,
  organizationLogoKey,
  type DeliveryEnv,
  type LogoBucket,
} from "../src/handler.ts";

const { isValidJpeg } = jpegImage;
const { BASELINE_JPEG_BASE64, PROGRESSIVE_JPEG_BASE64 } = jpegFixtures;

const filename = "a0e53cdf-0be5-4139-a657-000000000001.png";
const token = "test-upload-credential-with-at-least-32-characters";
const png = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/vXcAAAAASUVORK5CYII=",
  "base64",
));

function fixture() {
  const objects = new Map<string, Uint8Array>();
  const calls: Array<{ operation: string; key: string }> = [];
  const metadata: Array<{ contentType: string; cacheControl: string }> = [];
  const stored = (bytes: Uint8Array, includeBody: boolean) => ({
    httpEtag: '"test-etag"',
    size: bytes.byteLength,
    uploaded: new Date("2026-10-20T12:00:00.000Z"),
    body: includeBody ? new Blob([bytes]).stream() : undefined,
  });
  const bucket: LogoBucket = {
    async head(key) {
      calls.push({ operation: "head", key });
      const bytes = objects.get(key);
      return bytes ? stored(bytes, false) : null;
    },
    async get(key) {
      calls.push({ operation: "get", key });
      const bytes = objects.get(key);
      return bytes ? stored(bytes, true) : null;
    },
    async put(key, bytes, options) {
      calls.push({ operation: "put", key });
      assert.equal(options.onlyIf.get("if-none-match"), "*");
      metadata.push(options.httpMetadata);
      if (objects.has(key)) return null;
      const copy = new Uint8Array(bytes);
      objects.set(key, copy);
      return stored(copy, false);
    },
    async delete(key) {
      calls.push({ operation: "delete", key });
      objects.delete(key);
    },
  };
  const env: DeliveryEnv = {
    STATUS_PAGE_LOGOS: bucket,
    DELIVERY_UPLOAD_TOKEN: token,
  };
  return { env, objects, calls, metadata };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://delivery.outray.co${path}`, init);
}

function upload(path = `/internal/org-logos/${filename}`, overrides: RequestInit = {}) {
  return request(path, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "image/png",
      "content-length": String(png.byteLength),
    },
    body: png,
    ...overrides,
  });
}

test("organization uploads use an isolated object prefix and canonical public URL", async () => {
  const f = fixture();
  const response = await handleRequest(upload(), f.env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    key: `org-logos/${filename}`,
    url: `https://delivery.outray.co/org-logos/${filename}`,
  });
  assert.deepEqual([...f.objects.keys()], [`org-logos/${filename}`]);
  assert.deepEqual(f.metadata, [{
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
  }]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const duplicate = await handleRequest(upload(), f.env);
  assert.equal(duplicate.status, 409);
});

test("organization delivery supports GET, HEAD, and conditional ETags with safe image headers", async () => {
  const f = fixture();
  f.objects.set(`org-logos/${filename}`, png);
  const get = await handleRequest(request(`/org-logos/${filename}`), f.env);
  assert.equal(get.status, 200);
  assert.deepEqual(new Uint8Array(await get.arrayBuffer()), png);
  assert.equal(get.headers.get("content-type"), "image/png");
  assert.equal(get.headers.get("content-length"), String(png.byteLength));
  assert.equal(get.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(get.headers.get("x-content-type-options"), "nosniff");
  assert.equal(get.headers.get("access-control-allow-origin"), "*");
  assert.equal(get.headers.get("cross-origin-resource-policy"), "cross-origin");

  const head = await handleRequest(request(`/org-logos/${filename}`, { method: "HEAD" }), f.env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-length"), String(png.byteLength));
  assert.equal(f.calls.at(-1)?.operation, "head");

  const unchanged = await handleRequest(request(`/org-logos/${filename}`, {
    headers: { "if-none-match": 'W/"test-etag"' },
  }), f.env);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
});

test("organization uploads support WebP with a matching extension and signature", async () => {
  const f = fixture();
  const webp = new Uint8Array(Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  ));
  const webpName = filename.replace(/png$/, "webp");
  const response = await handleRequest(upload(`/internal/org-logos/${webpName}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "image/webp",
      "content-length": String(webp.byteLength),
    },
    body: webp,
  }), f.env);
  assert.equal(response.status, 201);
  const delivered = await handleRequest(request(`/org-logos/${webpName}`), f.env);
  assert.equal(delivered.headers.get("content-type"), "image/webp");
  assert.deepEqual(new Uint8Array(await delivered.arrayBuffer()), webp);
});

test("only exact UUID v4 supported-image logo paths can access the bucket", async () => {
  const f = fixture();
  const invalidPaths = [
    "/", "/private/config.json", "/org-logos/", "/org-logos/list",
    `/org-logos/${filename}/extra`, `/org-logos/${filename}.svg`,
    `/org-logos/nested%2F${filename}`, `/org-logos/%2e%2e%2F${filename}`,
    `/org-logos/${filename.toUpperCase()}`,
    `/org-logos/${filename.replace("-4139-", "-1139-")}`,
    `/internal/org-logos/${filename}/extra`, `/internal/private/${filename}`,
  ];
  for (const path of invalidPaths) {
    assert.equal((await handleRequest(request(path), f.env)).status, 404, path);
  }
  assert.deepEqual(f.calls, []);
  assert.equal(organizationLogoKey(filename), `org-logos/${filename}`);
  assert.equal(logoKey(filename), `uptime-logos/${filename}`);
  assert.equal(organizationLogoKey(`../${filename}`), null);
});

test("uptime and legacy status-page routes retain their original object mapping", async () => {
  const f = fixture();
  const response = await handleRequest(upload(`/internal/status-page-logos/${filename}`), f.env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    key: `uptime-logos/${filename}`,
    url: `https://delivery.outray.co/uptime-logos/${filename}`,
  });
  for (const prefix of ["uptime-logos", "status-page-logos"]) {
    const delivered = await handleRequest(request(`/${prefix}/${filename}`), f.env);
    assert.equal(delivered.status, 200);
    assert.deepEqual(new Uint8Array(await delivered.arrayBuffer()), png);
  }
  assert.equal((await handleRequest(request(`/org-logos/${filename}`), f.env)).status, 404);
  assert.ok(f.calls.slice(0, 3).every((call) => call.key === `uptime-logos/${filename}`));
});

test("organization writes require the configured upload token before touching storage", async () => {
  const f = fixture();
  for (const authorization of [undefined, "Bearer wrong", "Basic invalid"]) {
    const headers = new Headers({ "content-type": "image/png", "content-length": String(png.byteLength) });
    if (authorization) headers.set("authorization", authorization);
    for (const method of ["PUT", "DELETE"]) {
      const response = await handleRequest(request(`/internal/org-logos/${filename}`, {
        method, headers, ...(method === "PUT" ? { body: png } : {}),
      }), f.env);
      assert.equal(response.status, 401);
    }
  }
  const missingToken = await handleRequest(upload(), { ...f.env, DELIVERY_UPLOAD_TOKEN: undefined });
  assert.equal(missingToken.status, 401);
  assert.deepEqual(f.calls, []);
});

test("public organization routes are read only and private routes reject unsupported methods", async () => {
  const f = fixture();
  for (const method of ["PUT", "DELETE", "POST", "OPTIONS"]) {
    const response = await handleRequest(request(`/org-logos/${filename}`, { method }), f.env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
  const response = await handleRequest(request(`/internal/org-logos/${filename}`, {
    headers: { authorization: `Bearer ${token}` },
  }), f.env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "PUT, DELETE");
  assert.deepEqual(f.calls, []);
});

test("organization uploads reject spoofed, encoded, oversized, and truncated images", async () => {
  const f = fixture();
  const cases: Array<{ headers?: Record<string, string>; body?: Uint8Array; status: number }> = [
    { headers: { "content-type": "image/webp" }, status: 415 },
    { headers: { "content-encoding": "gzip" }, status: 415 },
    { headers: { "content-length": String(MAX_LOGO_BYTES + 1) }, status: 413 },
    { headers: { "content-length": "invalid" }, status: 411 },
    { headers: { "content-length": String(png.byteLength + 1) }, status: 400 },
    { headers: { "content-length": String(png.byteLength - 1) }, status: 400 },
    { body: new Uint8Array(png.byteLength), status: 415 },
  ];
  for (const item of cases) {
    const response = await handleRequest(upload(undefined, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "image/png",
        "content-length": String(png.byteLength),
        ...item.headers,
      },
      body: item.body ?? png,
    }), f.env);
    assert.equal(response.status, item.status);
  }
  assert.deepEqual(f.calls, []);
});

test("organization deletes are authenticated, idempotent, and isolated from uptime objects", async () => {
  const f = fixture();
  f.objects.set(`org-logos/${filename}`, png);
  f.objects.set(`uptime-logos/${filename}`, png);
  for (let index = 0; index < 2; index += 1) {
    const response = await handleRequest(request(`/internal/org-logos/${filename}`, {
      method: "DELETE", headers: { authorization: `Bearer ${token}` },
    }), f.env);
    assert.equal(response.status, 204);
  }
  assert.equal(f.objects.has(`org-logos/${filename}`), false);
  assert.equal(f.objects.has(`uptime-logos/${filename}`), true);
});

test("provider errors never disclose bucket details or credentials", async () => {
  const f = fixture();
  f.env.STATUS_PAGE_LOGOS.get = async () => { throw new Error(`private bucket ${token}`); };
  const response = await handleRequest(request(`/org-logos/${filename}`), f.env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Logo delivery is temporarily unavailable." });
});

test("organization JPG and JPEG paths accept real baseline and progressive images", async () => {
  for (const encoded of [BASELINE_JPEG_BASE64, PROGRESSIVE_JPEG_BASE64]) {
    for (const extension of ["jpg", "jpeg"]) {
      const f = fixture();
      const jpeg = new Uint8Array(Buffer.from(encoded, "base64"));
      const jpegName = filename.replace(/png$/, extension);
      const response = await handleRequest(upload(`/internal/org-logos/${jpegName}`, {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "image/jpeg",
          "content-length": String(jpeg.byteLength),
        },
        body: jpeg,
      }), f.env);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), {
        key: `org-logos/${jpegName}`,
        url: `https://delivery.outray.co/org-logos/${jpegName}`,
      });
      for (const method of ["GET", "HEAD"]) {
        const delivered = await handleRequest(request(`/org-logos/${jpegName}`, { method }), f.env);
        assert.equal(delivered.status, 200);
        assert.equal(delivered.headers.get("content-type"), "image/jpeg");
        assert.equal(delivered.headers.get("content-length"), String(jpeg.byteLength));
        const body = new Uint8Array(await delivered.arrayBuffer());
        assert.deepEqual(body, method === "GET" ? jpeg : new Uint8Array());
      }
      assert.equal(f.metadata[0]?.contentType, "image/jpeg");
    }
  }
});

test("uptime routes continue rejecting JPG and JPEG filenames", async () => {
  const f = fixture();
  for (const extension of ["jpg", "jpeg"]) {
    const jpegName = filename.replace(/png$/, extension);
    assert.equal(logoKey(jpegName), null);
    assert.equal(organizationLogoKey(jpegName), `org-logos/${jpegName}`);
    for (const prefix of ["uptime-logos", "status-page-logos"]) {
      assert.equal((await handleRequest(request(`/${prefix}/${jpegName}`), f.env)).status, 404);
    }
    assert.equal((await handleRequest(upload(`/internal/status-page-logos/${jpegName}`), f.env)).status, 404);
  }
  assert.deepEqual(f.calls, []);
});

test("JPEG uploads require matching MIME and a complete structural image", async () => {
  const f = fixture();
  const jpegName = filename.replace(/png$/, "jpg");
  const jpeg = new Uint8Array(Buffer.from(BASELINE_JPEG_BASE64, "base64"));
  for (const contentType of ["image/jpg", "image/png", "application/octet-stream"]) {
    const response = await handleRequest(upload(`/internal/org-logos/${jpegName}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
        "content-length": String(jpeg.byteLength),
      },
      body: jpeg,
    }), f.env);
    assert.equal(response.status, 415);
  }
  for (const body of [png, jpeg.subarray(0, -1), new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]) {
    const response = await handleRequest(upload(`/internal/org-logos/${jpegName}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "image/jpeg",
        "content-length": String(body.byteLength),
      },
      body,
    }), f.env);
    assert.equal(response.status, 415);
    assert.match(await response.text(), /valid PNG, WebP, or JPEG/);
  }
  assert.deepEqual(f.calls, []);
});

test("JPEG validation rejects every truncated baseline and progressive image", () => {
  for (const encoded of [BASELINE_JPEG_BASE64, PROGRESSIVE_JPEG_BASE64]) {
    const bytes = Buffer.from(encoded, "base64");
    assert.equal(isValidJpeg(bytes), true);
    for (let length = 0; length < bytes.length; length += 1) {
      assert.equal(isValidJpeg(bytes.subarray(0, length)), false, `truncated at ${length}`);
    }
    assert.equal(isValidJpeg(Buffer.concat([bytes, Buffer.from([0])])), false);
  }
});

test("JPEG validation requires valid segment lengths, frame dimensions, and nonempty scans", () => {
  const baseline = Buffer.from(BASELINE_JPEG_BASE64, "base64");
  const frame = baseline.indexOf(Buffer.from([0xff, 0xc0]));
  const scan = baseline.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(frame > 0 && scan > frame);
  const scanStart = scan + 2 + baseline.readUInt16BE(scan + 2);
  const changed = (offset: number, value: number) => {
    const bytes = Buffer.from(baseline);
    bytes[offset] = value;
    return bytes;
  };
  const malformed = [
    Buffer.from([0xff, 0xd8, ...new TextEncoder().encode("not a JPEG"), 0xff, 0xd9]),
    changed(0, 0),
    changed(4, 0xff), // APP length exceeds the actual buffer.
    changed(5, 1), // Segment length cannot be smaller than its two length bytes.
    changed(frame + 3, 7), // Frame header is truncated within its segment.
    changed(frame + 6, 0), // Height 2 becomes zero.
    changed(frame + 8, 0), // Width 2 becomes zero.
    changed(frame + 9, 0), // A frame must have components.
    changed(scan + 3, 2), // SOS length does not contain its component list.
    changed(scan + 5, 99), // SOS references an undefined frame component.
    Buffer.concat([baseline.subarray(0, frame), baseline.subarray(scan)]), // SOS before SOF.
    Buffer.concat([baseline.subarray(0, scanStart), Buffer.from([0xff, 0xd9])]), // Empty scan.
    Buffer.concat([baseline.subarray(0, scanStart), Buffer.from([0xff, 0xd0, 0xff, 0xd9])]), // Restart only.
  ];
  for (const bytes of malformed) assert.equal(isValidJpeg(bytes), false);
});

test("JPEG scan traversal handles stuffed FF bytes, restart markers, and marker fill", () => {
  const baseline = Buffer.from(BASELINE_JPEG_BASE64, "base64");
  const scan = baseline.indexOf(Buffer.from([0xff, 0xda]));
  const start = scan + 2 + baseline.readUInt16BE(scan + 2);
  const prefix = baseline.subarray(0, start);
  // These structural scan variants isolate traversal; the real encoded fixtures
  // above exercise complete images, including all ten progressive scans.
  assert.equal(isValidJpeg(Buffer.concat([
    prefix, Buffer.from([0x01, 0xff, 0x00, 0xff, 0xd0, 0x02, 0xff, 0xff, 0xd9]),
  ])), true);
  assert.equal(isValidJpeg(Buffer.concat([
    prefix, Buffer.from([0x01, 0xff, 0xff, 0x00, 0xff, 0xd9]),
  ])), false);
});
