import assert from "node:assert/strict";
import test from "node:test";
import { isOrganizationSettingsPath, organizationSettingsItems, personalSettingsItems, settingsItemIsActive } from "../src/components/workspace/settings-navigation-state";

test("personal settings belong to the account and remain independent of organization selection", () => {
  assert.deepEqual(personalSettingsItems.map((item) => item.href), ["/account/settings", "/account/settings/connected-apps"]);
  const [general, apps] = personalSettingsItems;
  assert.equal(settingsItemIsActive(general, "/account/settings/"), true);
  assert.equal(settingsItemIsActive(general, apps.href), false);
  assert.equal(settingsItemIsActive(apps, apps.href), true);
});

test("organization navigation preserves scope and only includes billing when allowed", () => {
  const items = organizationSettingsItems("acme", true);
  assert.deepEqual(items.map((item) => item.href), ["/acme/settings/organization", "/acme/members", "/acme/tokens", "/acme/billing"]);
  assert.deepEqual(organizationSettingsItems("acme", false).map((item) => item.label), ["General", "Members", "API tokens"]);
  assert.equal(items.some((item) => item.href.startsWith("/account/")), false);
  for (const item of items) {
    assert.equal(settingsItemIsActive(item, item.href), true);
    assert.equal(settingsItemIsActive(item, item.href.replace("/acme/", "/other/")), false);
    assert.equal(settingsItemIsActive(item, `${item.href}-other`), false);
  }
  assert.equal(organizationSettingsItems("team /?β", true)[0].href, "/team%20%2F%3F%CE%B2/settings/organization");
});

test("settings context recognizes existing administration links without capturing product pages", () => {
  for (const path of ["/acme/settings", "/acme/settings/organization", "/acme/members", "/acme/tokens", "/acme/billing", "/acme/billing/history"]) assert.equal(isOrganizationSettingsPath(path, "acme"), true, path);
  for (const path of ["/account/settings", "/other/settings", "/acme/tunnel", "/acme/members-other", "/acme/settings-other", "/acmeish/settings"]) assert.equal(isOrganizationSettingsPath(path, "acme"), false, path);
});
