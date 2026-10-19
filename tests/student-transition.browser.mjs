// Optional browser regression: uses an installed Playwright, synthetic data only.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createApp } from "../server/index.mjs";
import { initialState } from "../server/demo-content.mjs";
import { groupedFixture } from "./fixtures/grouped-test.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const directory = mkdtempSync(join(tmpdir(), "rns-transition-"));
const databasePath = join(directory, "test.sqlite");
const api = createApp({ databasePath });
const state = initialState();
state.tests.push(groupedFixture());
// Optional local content check. Source materials and keys remain outside Git.
for (const path of (process.env.SUBMISSION_TEST_FILES || "")
  .split(",")
  .filter(Boolean)) {
  const test = JSON.parse(readFileSync(path, "utf8"));
  state.tests.push({ ...test, shareToken: `local-check-${test.versionId}` });
}
const db = new DatabaseSync(databasePath);
db.prepare("UPDATE app_state SET payload=? WHERE id=1").run(
  JSON.stringify(state),
);
db.close();
const web = await createServer({
  configFile: false,
  plugins: [react()],
  define: { "import.meta.env.VITE_APP_MODE": JSON.stringify("demo") },
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  await web.listen();
  const webUrl = `http://127.0.0.1:${web.httpServer.address().port}`;
  const apiUrl = `http://127.0.0.1:${api.address().port}/api/rpc`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
  });
  mkdirSync(".local/student-transition", { recursive: true });
  for (const [width, height] of [
    [1366, 768],
    [960, 650],
    [390, 844],
    [360, 800],
  ]) {
    for (const test of state.tests) {
      const context = await browser.newContext({ viewport: { width, height } });
      let failedSubmissionsRemaining = width === 1366 ? 2 : 0;
      let loseSavedResponse = width === 390;
      await context.route("**/api/rpc", async (route) => {
        if (
          route.request().postDataJSON().action === "submit_attempt" &&
          failedSubmissionsRemaining > 0
        ) {
          failedSubmissionsRemaining--;
          await route.abort("failed");
          return;
        }
        const response = await route.fetch({
          url: apiUrl,
          headers: { origin: new URL(apiUrl).origin },
        });
        if (
          route.request().postDataJSON().action === "submit_attempt" &&
          loseSavedResponse
        ) {
          loseSavedResponse = false;
          await route.abort("failed");
          return;
        }
        await route.fulfill({ response });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${webUrl}/#/test/${test.shareToken}`);
      await page
        .getByPlaceholder("Например, Маша Иванова")
        .fill("Тест перехода");
      await page
        .getByRole("button", { name: "Понедельник", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: test.exam === "ОГЭ" ? "18:30" : "17:30",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Начать тест", exact: true })
        .click();
      await page.locator(".question-card").waitFor();
      for (let i = 0; i < test.exercises.length; i++) {
        await page.locator(".question-tabs button").nth(i).click();
        if (test.exercises[i].type === "group") {
          await page.getByRole("textbox").nth(0).fill("321");
          await page.getByRole("checkbox").nth(1).check();
          await page.getByRole("textbox").nth(1).fill("ёлка");
        } else {
          for (const id of test.exercises[i].key)
            await page
              .getByRole("checkbox")
              .nth(Number(id) - 1)
              .check();
        }
      }
      const send = async () => {
        await page
          .getByRole("button", { name: "Завершить и проверить", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Отправить ответы", exact: true })
          .click();
      };
      if (failedSubmissionsRemaining) {
        const savedDraft = await page.evaluate(
          () =>
            Object.entries(localStorage).find(([key]) =>
              key.startsWith("rns-draft:"),
            )[1],
        );
        await send();
        await page.getByRole("alert").waitFor();
        assert.match(
          await page.getByRole("alert").innerText(),
          /Ответы остаются/,
        );
        assert.equal(await page.locator(".result-score").count(), 0);
        assert.equal(await page.locator(".question-card").count(), 1);
        await page.screenshot({
          path: `.local/student-transition/${test.versionId}-${width}-network.png`,
          fullPage: true,
        });
        assert.equal(failedSubmissionsRemaining, 0);
        await page.reload();
        await page.locator(".question-card").waitFor();
        assert.equal(
          await page.evaluate(
            () =>
              Object.entries(localStorage).find(([key]) =>
                key.startsWith("rns-draft:"),
              )[1],
          ),
          savedDraft,
        );
      }
      // Model the DOM changes made by Google Translate: replace text nodes
      // with <font> elements while React still holds the original references.
      await page.evaluate(() => {
        const walker = document.createTreeWalker(
          document.querySelector(".student-main"),
          NodeFilter.SHOW_TEXT,
        );
        const nodes = [];
        while (walker.nextNode())
          if (walker.currentNode.textContent.trim())
            nodes.push(walker.currentNode);
        for (const node of nodes) {
          const font = document.createElement("font");
          font.textContent = node.textContent;
          node.replaceWith(font);
        }
      });
      await send();
      await page.locator(".result-score").waitFor();
      await page.waitForFunction(() => window.scrollY === 0);
      assert.match(await page.locator(".result-score").innerText(), /100%/);
      assert.equal(
        await page
          .locator(".review-list")
          .first()
          .locator(":scope > article")
          .count(),
        test.exercises.length,
      );
      const resultId = await page.evaluate(
        () =>
          Object.entries(localStorage).find(([key]) =>
            key.startsWith("rns-result:"),
          )[1],
      );
      const checkDb = new DatabaseSync(databasePath);
      const persisted = JSON.parse(
        checkDb.prepare("SELECT payload FROM app_state WHERE id=1").get()
          .payload,
      );
      checkDb.close();
      const savedAttempts = persisted.attempts.filter(
        (attempt) => attempt.id === resultId,
      );
      assert.equal(savedAttempts.length, 1);
      assert.equal(savedAttempts[0].status, "submitted");
      assert.equal(savedAttempts[0].correct, savedAttempts[0].total);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `.local/student-transition/${test.versionId}-${width}.png`,
      });
      await page.reload();
      await page.locator(".result-score").waitFor();
      assert.match(await page.locator(".result-score").innerText(), /100%/);
      await page
        .getByRole("button", { name: "Пройти ещё раз", exact: true })
        .click();
      await page
        .getByPlaceholder("Например, Маша Иванова")
        .fill("Повторное прохождение");
      await page
        .getByRole("button", { name: "Начать тест", exact: true })
        .click();
      await page.locator(".question-card").waitFor();
      const draftId = await page.evaluate(
        () =>
          JSON.parse(
            Object.entries(localStorage).find(([key]) =>
              key.startsWith("rns-draft:"),
            )[1],
          ).id,
      );
      assert.notEqual(draftId, resultId);
      assert.deepEqual(errors, []);
      console.log(
        `${test.id} ${width}×${height}: result without reload, recovery and new attempt OK`,
      );
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await web.close();
  await new Promise((resolve) => api.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
