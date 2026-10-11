import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { transformWithEsbuild } from "vite";

test("password login sends credentials only to Auth and keeps student sessions separate", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let loginError = null;
  let overviewError = null;
  const session = (id, anonymous = false) => {
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    return {
      access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
      refresh_token: `test-refresh-${id}`,
      expires_in: 3600,
      token_type: "bearer",
      user: { id, is_anonymous: anonymous, aud: "authenticated" },
    };
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const body = options.body ? JSON.parse(options.body) : null;
    const headers = new Headers(options.headers);
    requests.push({ url, body, headers });
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "password");
      return new Response(JSON.stringify(loginError || session("teacher")), {
        status: loginError ? 400 : 200,
        headers: { "x-supabase-api-version": "2024-01-01" },
      });
    }
    if (url.pathname === "/auth/v1/signup")
      return new Response(JSON.stringify(session("student", true)));
    if (url.pathname === "/rest/v1/rpc/teacher_overview" && overviewError)
      return new Response(JSON.stringify(overviewError), { status: 403 });
    if (url.pathname.startsWith("/rest/v1/rpc/"))
      return new Response(JSON.stringify({ ok: true }));
    if (url.pathname === "/auth/v1/logout")
      return new Response(null, { status: 204 });
    throw new Error(`Unexpected Auth request: ${url.pathname}`);
  };
  try {
    const require = createRequire(import.meta.url);
    const sdk = pathToFileURL(require.resolve("@supabase/supabase-js")).href;
    const source = readFileSync(
      new URL("../src/api.ts", import.meta.url),
      "utf8",
    ).replace('"@supabase/supabase-js"', JSON.stringify(sdk));
    const { code } = await transformWithEsbuild(source, "api.ts", {
      loader: "ts",
      format: "esm",
      define: {
        "import.meta.env": JSON.stringify({
          VITE_APP_MODE: "supabase",
          VITE_SUPABASE_URL: "https://password-auth.example.test",
          VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        }),
      },
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(code + "\n//# sourceURL=password-auth-api.mjs").toString("base64")}`
    );
    assert.equal(await api.teacherOverview(), null);
    assert.equal(requests.length, 0, "No teacher request before login");
    loginError = {
      code: "invalid_credentials",
      message: "Invalid login credentials",
    };
    await assert.rejects(
      () => api.login("teacher@example.test", "wrong"),
      /Неверный email или пароль/,
    );
    loginError = {
      code: "email_not_confirmed",
      message: "Email not confirmed",
    };
    await assert.rejects(
      () => api.login("teacher@example.test", "wrong"),
      /Подтвердите аккаунт в Supabase/,
    );
    loginError = null;
    const password = "  test password with spaces  ";
    await api.login(" teacher@example.test ", password, "teacher-captcha");
    const credentials = requests.at(-1).body;
    assert.equal(credentials.email, "teacher@example.test");
    assert.equal(credentials.password, password);
    assert.equal(
      credentials.gotrue_meta_security.captcha_token,
      "teacher-captcha",
    );
    await api.teacherOverview();
    const teacherRequest = requests.at(-1);
    assert.deepEqual(teacherRequest.body, { p_args: {} });
    await api.rpc("get_test", {
      token: "sample",
      captchaToken: "student-captcha",
    });
    const studentRequest = requests.at(-1);
    assert.notEqual(
      studentRequest.headers.get("authorization"),
      teacherRequest.headers.get("authorization"),
    );
    assert.ok(
      requests.some((request) => request.url.pathname === "/auth/v1/signup"),
    );
    assert.ok(
      requests.every((request) => !/otp|verify/.test(request.url.pathname)),
    );
    overviewError = {
      code: "42501",
      message: "Доступ только для преподавателя.",
    };
    await assert.rejects(
      () => api.teacherOverview(),
      /Доступ только для преподавателя/,
    );
    overviewError = null;
    await api.logout();
    const countAfterLogout = requests.length;
    assert.equal(await api.teacherOverview(), null);
    assert.equal(
      requests.length,
      countAfterLogout,
      "No teacher request after logout",
    );
    await api.resetStudent();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
