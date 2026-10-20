import assert from "node:assert/strict";
import test from "node:test";
import jpegFixtures from "../../../shared/test/fixtures/jpeg";
import {
  deleteNewOrganizationLogo, InvalidOrganizationLogo, MAX_ORGANIZATION_LOGO_BYTES,
  readOrganizationLogoUpload, storeOrganizationLogo, validateOrganizationLogo,
} from "../src/lib/organization-logo-storage.server";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0YQAAAAASUVORK5CYII=", "base64");
const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const jpeg = Buffer.from(jpegFixtures.BASELINE_JPEG_BASE64, "base64");
const progressiveJpeg = Buffer.from(jpegFixtures.PROGRESSIVE_JPEG_BASE64, "base64");
function upload(bytes: Uint8Array = png, type = "image/png", extra?: (form: FormData) => void, fileName = "logo.png") {
  const form = new FormData();
  form.set("logo", new File([bytes], fileName, { type }));
  extra?.(form);
  return new Request("https://console.outray.test/api/team/organization/logo", { method: "POST", body: form });
}

test("organization logos accept bounded PNG/WebP structures and reject MIME spoofing and truncated signatures", async () => {
  assert.equal(validateOrganizationLogo(png, "image/png").extension, "png");
  assert.equal(validateOrganizationLogo(webp, "image/webp").extension, "webp");
  for (const [bytes, type] of [[png, "image/webp"], [png.subarray(0, 8), "image/png"], [webp.subarray(0, 12), "image/webp"], [Buffer.from("<svg/>"), "image/png"]] as const) {
    assert.throws(() => validateOrganizationLogo(bytes, type), InvalidOrganizationLogo);
  }
  assert.throws(() => validateOrganizationLogo(new Uint8Array(MAX_ORGANIZATION_LOGO_BYTES + 1), "image/png"), (error: unknown) => error instanceof InvalidOrganizationLogo && error.status === 413);
  assert.equal((await readOrganizationLogoUpload(upload())).contentType, "image/png");
  for (const request of [upload(png, "image/webp"), upload(png, "image/svg+xml"), upload(png, ""),
    upload(png, "image/png", (form) => form.set("organizationId", "other-tenant")),
    upload(png, "image/png", (form) => form.append("logo", new File([png], "second.png", { type: "image/png" })))]) {
    await assert.rejects(readOrganizationLogoUpload(request), InvalidOrganizationLogo);
  }
});

test("JPEG and JPG uploads accept baseline and progressive images with canonical JPEG metadata", async () => {
  for (const bytes of [jpeg, progressiveJpeg]) {
    assert.deepEqual(validateOrganizationLogo(bytes, "image/jpeg"), { bytes, contentType: "image/jpeg", extension: "jpg" });
    assert.equal(validateOrganizationLogo(bytes).contentType, "image/jpeg");
    for (const fileName of ["logo.jpg", "logo.jpeg"]) {
      const image = await readOrganizationLogoUpload(upload(bytes, "image/jpeg", undefined, fileName));
      assert.equal(image.contentType, "image/jpeg");
      assert.equal(image.extension, "jpg");
      assert.deepEqual(image.bytes, new Uint8Array(bytes));
    }
  }
});

test("JPEG uploads reject MIME mismatches, spoofing, missing data and truncation", async () => {
  for (const [bytes, type] of [
    [jpeg, "image/png"], [png, "image/jpeg"], [Buffer.from("<svg/>"), "image/jpeg"],
    [jpeg.subarray(0, 2), "image/jpeg"], [jpeg.subarray(0, jpeg.length - 2), "image/jpeg"],
    [progressiveJpeg.subarray(0, progressiveJpeg.length - 5), "image/jpeg"],
    [Buffer.concat([jpeg, Buffer.from("trailing data")]), "image/jpeg"],
  ] as const) {
    assert.throws(() => validateOrganizationLogo(bytes, type), InvalidOrganizationLogo);
    await assert.rejects(readOrganizationLogoUpload(upload(bytes, type, undefined, "logo.jpg")), InvalidOrganizationLogo);
  }
});

test("multipart uploads reject missing/invalid fields, advertised oversize and bounded chunked overflow", async () => {
  for (const request of [
    new Request("https://test.invalid", { method: "POST", body: "image" }),
    new Request("https://test.invalid", { method: "POST", body: new FormData() }),
    new Request("https://test.invalid", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=broken" }, body: "invalid" }),
  ]) await assert.rejects(readOrganizationLogoUpload(request), InvalidOrganizationLogo);
  const advertised = upload();
  advertised.headers.set("content-length", String(MAX_ORGANIZATION_LOGO_BYTES + 16_385));
  await assert.rejects(readOrganizationLogoUpload(advertised), (error: unknown) => error instanceof InvalidOrganizationLogo && error.status === 413);
  const tooLargeFile = upload(new Uint8Array(MAX_ORGANIZATION_LOGO_BYTES + 1));
  await assert.rejects(readOrganizationLogoUpload(tooLargeFile), (error: unknown) => error instanceof InvalidOrganizationLogo && error.status === 413);
  let cancelled = false;
  const chunked = new Request("https://test.invalid", { method: "POST", duplex: "half", headers: { "content-type": "multipart/form-data; boundary=chunked" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_ORGANIZATION_LOGO_BYTES + 16_385)); }, cancel() { cancelled = true; } }),
  } as RequestInit);
  await assert.rejects(readOrganizationLogoUpload(chunked), (error: unknown) => error instanceof InvalidOrganizationLogo && error.status === 413);
  assert.equal(cancelled, true);
});

test("organization logo storage uses authenticated immutable delivery paths and safe managed cleanup", async (t) => {
  const old = { origin: process.env.DELIVERY_PUBLIC_URL, token: process.env.DELIVERY_UPLOAD_TOKEN };
  t.after(() => {
    if (old.origin === undefined) delete process.env.DELIVERY_PUBLIC_URL; else process.env.DELIVERY_PUBLIC_URL = old.origin;
    if (old.token === undefined) delete process.env.DELIVERY_UPLOAD_TOKEN; else process.env.DELIVERY_UPLOAD_TOKEN = old.token;
  });
  process.env.DELIVERY_PUBLIC_URL = "https://delivery.outray.test";
  process.env.DELIVERY_UPLOAD_TOKEN = "synthetic-test-upload-token-01234567890123456789";
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: init.method === "PUT" ? 201 : 204 });
  });
  const stored = await storeOrganizationLogo(png, "image/png");
  assert.match(stored.url, /^https:\/\/delivery\.outray\.test\/org-logos\/[a-f0-9-]{36}\.png$/);
  assert.equal(calls[0].url, `https://delivery.outray.test/internal/org-logos/${stored.fileName}`);
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${process.env.DELIVERY_UPLOAD_TOKEN}`);
  assert.equal(headers.get("content-type"), "image/png");
  assert.equal(headers.get("content-length"), String(png.byteLength));
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  await deleteNewOrganizationLogo(stored);
  assert.equal(calls[1].init.method, "DELETE");
  const storedJpeg = await storeOrganizationLogo(jpeg, "image/jpeg");
  assert.match(storedJpeg.url, /^https:\/\/delivery\.outray\.test\/org-logos\/[a-f0-9-]{36}\.jpg$/);
  assert.equal(calls[2].url, `https://delivery.outray.test/internal/org-logos/${storedJpeg.fileName}`);
  assert.equal(new Headers(calls[2].init.headers).get("content-type"), "image/jpeg");
  assert.deepEqual(calls[2].init.body, jpeg);
  await deleteNewOrganizationLogo(storedJpeg);
  assert.equal(calls[3].init.method, "DELETE");
  for (const invalid of [{ ...stored, fileName: "../other.png" }, { ...stored, url: "https://untrusted.invalid/object.png" }]) {
    await assert.rejects(deleteNewOrganizationLogo(invalid), /Invalid managed/);
  }
  assert.equal(calls.length, 4);
  assert.doesNotMatch(JSON.stringify(stored), /synthetic-test/);
});

test("storage failures, missing credentials and unsafe origins cannot yield a persisted logo URL", async (t) => {
  const old = { origin: process.env.DELIVERY_PUBLIC_URL, token: process.env.DELIVERY_UPLOAD_TOKEN };
  t.after(() => {
    if (old.origin === undefined) delete process.env.DELIVERY_PUBLIC_URL; else process.env.DELIVERY_PUBLIC_URL = old.origin;
    if (old.token === undefined) delete process.env.DELIVERY_UPLOAD_TOKEN; else process.env.DELIVERY_UPLOAD_TOKEN = old.token;
  });
  process.env.DELIVERY_PUBLIC_URL = "https://delivery.outray.test";
  process.env.DELIVERY_UPLOAD_TOKEN = "synthetic-token";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("untrusted storage error", { status: 403 }); });
  await assert.rejects(storeOrganizationLogo(png), /storage returned 403/);
  assert.equal(calls, 1);
  delete process.env.DELIVERY_UPLOAD_TOKEN;
  await assert.rejects(storeOrganizationLogo(png), /DELIVERY_UPLOAD_TOKEN/);
  for (const origin of ["http://delivery.outray.test", "https://delivery.outray.test/path", "https://user:pass@delivery.outray.test"]) {
    process.env.DELIVERY_PUBLIC_URL = origin;
    await assert.rejects(storeOrganizationLogo(png));
  }
  assert.equal(calls, 1);
});
