"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { apiOrigin, errorPayload, githubFailure, proxyPath, publicGame, validateMetadata } = require("../index");

test("Render service URL is used unless a custom public API origin is set", () => {
  const previousPublicOrigin = process.env.PUBLIC_API_ORIGIN;
  const previousRenderUrl = process.env.RENDER_EXTERNAL_URL;
  try {
    delete process.env.PUBLIC_API_ORIGIN;
    process.env.RENDER_EXTERNAL_URL = "https://houssam-publishing-api.onrender.com";
    assert.equal(apiOrigin(), process.env.RENDER_EXTERNAL_URL);
    process.env.PUBLIC_API_ORIGIN = "https://api.example.com";
    assert.equal(apiOrigin(), process.env.PUBLIC_API_ORIGIN);
  } finally {
    if (previousPublicOrigin === undefined) delete process.env.PUBLIC_API_ORIGIN;
    else process.env.PUBLIC_API_ORIGIN = previousPublicOrigin;
    if (previousRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = previousRenderUrl;
  }
});

test("only public proxy routes map to a game inside private repository paths", () => {
  assert.deepEqual(proxyPath(new URL("https://api.example/games/12345678-1234-1234-1234-123456789012/index.html")), {
    id: "12345678-1234-1234-1234-123456789012",
    repoPath: "published/12345678-1234-1234-1234-123456789012/index.html"
  });
  assert.deepEqual(proxyPath(new URL("https://api.example/downloads/12345678-1234-1234-1234-123456789012/12345678-1234-1234-1234-123456789012-v1.zip")), {
    id: "12345678-1234-1234-1234-123456789012",
    repoPath: "submissions/12345678-1234-1234-1234-123456789012/uploads/game.zip",
    download: true
  });
  assert.equal(proxyPath(new URL("https://api.example/submissions/private.json")), null);
  assert.equal(proxyPath(new URL("https://api.example/games/12345678-1234-1234-1234-123456789012/%2F..%2F..%2Fsubmissions%2Fsubmission.json")), null);
  assert.equal(proxyPath(new URL("https://api.example/downloads/12345678-1234-1234-1234-123456789012/other-game-v1.zip")), null);
});

test("public catalog entries omit private account, moderation and staging data", () => {
  const result = publicGame({
    id: "game", creatorUid: "private-user", stagingPaths: ["private/upload"], moderation: { reports: ["private"] },
    downloadPath: "submissions/private/uploads/game.zip", title: "Public game", status: "Published"
  });
  assert.deepEqual(result, { id: "game", title: "Public game", status: "Published" });
});

test("game metadata permits supported genres and types only", () => {
  assert.deepEqual(validateMetadata({
    title: "Game", shortDescription: "Short", description: "Description", genre: "Puzzle", type: "browser", tags: ["indie"]
  }), { title: "Game", shortDescription: "Short", description: "Description", genre: "Puzzle", type: "browser", tags: ["indie"] });
  assert.throws(() => validateMetadata({
    title: "Game", shortDescription: "Short", description: "Description", genre: "Other", type: "invalid"
  }), { status: 400 });
});

test("GitHub failures map to sanitized actionable categories", () => {
  assert.deepEqual(
    [401, 403, 404, 503].map(status => {
      const error = githubFailure(status);
      return { status: error.status, code: error.code, message: error.message };
    }),
    [
      { status: 502, code: "github_authentication_failed", message: "Publishing storage authentication failed. Please contact the site administrator." },
      { status: 502, code: "github_permission_denied", message: "Publishing storage denied access. Please contact the site administrator." },
      { status: 502, code: "github_repository_not_found", message: "The publishing repository or branch could not be found. Please contact the site administrator." },
      { status: 503, code: "github_unavailable", message: "Publishing storage is temporarily unavailable. Please try again later." }
    ]
  );
  assert.equal(githubFailure(403, true).code, "github_rate_limited");
  assert.equal(githubFailure(429).code, "github_rate_limited");
});

test("error responses include a correlation ID and never expose uncategorized details", () => {
  const result = errorPayload(new Error("private token or upstream response"), "request-123");
  assert.deepEqual(result, {
    status: 500,
    payload: { error: "The request could not be completed.", code: "internal_error", requestId: "request-123" }
  });

  const invalidUpload = Object.assign(new Error("The uploaded file exceeds the allowed size."), {
    status: 413,
    code: "upload_too_large"
  });
  assert.deepEqual(errorPayload(invalidUpload, "request-456"), {
    status: 413,
    payload: { error: "The uploaded file exceeds the allowed size.", code: "upload_too_large", requestId: "request-456" }
  });
});
