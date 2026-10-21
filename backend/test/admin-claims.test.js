"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { removeAdminClaim } = require("../demote-admin");

test("removes only the admin custom claim without mutating existing claims", () => {
  const customClaims = { admin: true, moderator: true, plan: "pro" };

  assert.deepEqual(removeAdminClaim(customClaims), { moderator: true, plan: "pro" });
  assert.deepEqual(customClaims, { admin: true, moderator: true, plan: "pro" });
});

test("returns an empty claims object when no custom claims are set", () => {
  assert.deepEqual(removeAdminClaim(), {});
  assert.deepEqual(removeAdminClaim({ moderator: true }), { moderator: true });
});
