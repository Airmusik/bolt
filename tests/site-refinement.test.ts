import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assistantDisplayOrder,
  isAssistantPagePath,
} from "../src/lib/assistantArticle.ts";

test("assistant display order supports clearing and zero without silently substituting 100", () => {
  assert.equal(assistantDisplayOrder(""), null);
  assert.equal(assistantDisplayOrder("0"), 0);
  assert.equal(assistantDisplayOrder("100"), 100);
  for (const invalid of ["-1", "1.5", "Infinity", "1e5", "100001"])
    assert.equal(assistantDisplayOrder(invalid), null);
});
test("assistant links stay inside the site", () => {
  for (const safe of ["", "/terms", "/contact", "/dashboard?tab=connections"])
    assert.equal(isAssistantPagePath(safe), true);
  for (const unsafe of [
    "javascript:alert(1)",
    "//example.com",
    "/\\example.com",
    "https://example.com",
    "/%2fexample.com",
    "/terms\n#bad",
  ])
    assert.equal(isAssistantPagePath(unsafe), false);
});
