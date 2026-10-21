import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseState, deployFromGit } from "./deploy-from-git.mjs";

const commit = "a".repeat(40);
const status = (state, target_url = "https://ci.outray.dev/repos/1/pipeline/123/1") => ({
  sha: commit, statuses: [{ context: "ci/woodpecker/push/ci", state, target_url }],
});

test("release requires the matching successful Woodpecker check", () => {
  assert.equal(releaseState(status("success"), commit), "success");
  assert.equal(releaseState(status("pending"), commit), "pending");
  assert.equal(releaseState(status("failure"), commit), "failure");
  assert.equal(releaseState(status("error"), commit), "error");
});
test("missing checks wait, and unrelated successful checks cannot release", () => {
  assert.equal(releaseState({ sha: commit, statuses: [] }, commit), "pending");
  assert.equal(releaseState({ sha: commit, statuses: [{ context: "Vercel", state: "success" }] }, commit), "pending");
});
test("older builds cannot release after the production branch moves", () => {
  assert.equal(releaseState(status("success"), "b".repeat(40)), "superseded");
});
test("a similarly named check on an untrusted CI target cannot release", () => {
  for (const target of ["https://other.example/repos/1/pipeline/123/1", "https://ci.outray.dev/repos/2/pipeline/123/1", "https://user:pass@ci.outray.dev/repos/1/pipeline/123/1", "not a URL"]) {
    assert.equal(releaseState(status("success", target), commit), "invalid");
  }
  assert.equal(releaseState(status("unknown"), commit), "invalid");
});
test("nonproduction branches and absent build identities fail before network access", async () => {
  await assert.rejects(deployFromGit({ WORKERS_CI_BRANCH: "main", WORKERS_CI_COMMIT_SHA: commit }), /next branch/);
  await assert.rejects(deployFromGit({ WORKERS_CI_BRANCH: "next" }), /next branch/);
});
