/**
 * API smoke tests — run: npm test
 * Requires Node 18+ (fetch). Does not call real ESP APIs except controlled error paths.
 */
import assert from "assert/strict";
import handler from "../api/index.js";

function makeRes() {
  const res = {
    statusCode: 200,
    _json: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this._json = obj;
      return this;
    },
  };
  return res;
}

async function run(name, fn) {
  try {
    await fn();
    console.log("OK:", name);
  } catch (e) {
    console.error("FAIL:", name);
    console.error(e);
    process.exitCode = 1;
  }
}

await run("rejects GET with 405", async () => {
  const res = makeRes();
  await handler({ method: "GET", url: "/api/foo", query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res._json.error, "Method not allowed");
});

await run("unknown POST route returns 404", async () => {
  const res = makeRes();
  await handler(
    { method: "POST", url: "/api", query: { path: "route-does-not-exist-xyz" }, body: {}, headers: {} },
    res,
  );
  assert.equal(res.statusCode, 404);
});

await run("marketing-esps unknown action returns 400", async () => {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      url: "/api",
      query: { path: "marketing-esps" },
      body: { provider: "klaviyo", action: "not_a_real_action" },
      headers: {},
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res._json.ok, false);
});

await run("marketing-esps ping klaviyo without key returns 500", async () => {
  const prev = process.env.KLAVIYO_PRIVATE_API_KEY;
  delete process.env.KLAVIYO_PRIVATE_API_KEY;
  const res = makeRes();
  await handler(
    {
      method: "POST",
      url: "/api",
      query: { path: "marketing-esps" },
      body: { provider: "klaviyo", action: "ping" },
      headers: {},
    },
    res,
  );
  if (prev !== undefined) process.env.KLAVIYO_PRIVATE_API_KEY = prev;
  assert.equal(res.statusCode, 500);
  assert.equal(res._json.ok, false);
});

await run("marketing-esps push_subscribers empty array returns 400", async () => {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      url: "/api",
      query: { path: "marketing-esps" },
      body: { provider: "klaviyo", action: "push_subscribers", subscribers: [] },
      headers: {},
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

await run("marketing-esps pull klaviyo without listId returns 400", async () => {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      url: "/api",
      query: { path: "marketing-esps" },
      body: { provider: "klaviyo", action: "pull_subscribers" },
      headers: {},
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

await run("md5 helper path: mailchimp push needs listId", async () => {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      url: "/api",
      query: { path: "marketing-esps" },
      body: {
        provider: "mailchimp",
        action: "push_subscribers",
        listId: "",
        subscribers: [{ email: "a@b.com", name: "A", phone: "" }],
      },
      headers: {},
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

console.log(process.exitCode ? "Some tests failed." : "All tests passed.");
