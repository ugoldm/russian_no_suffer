import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createApp } from "../server/index.mjs";
import { demoTest } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";
import { filledAnswers } from "./fixtures/filled-answers.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const directory = mkdtempSync(join(tmpdir(), "rns-library-"));
const databasePath = join(directory, "test.sqlite");
const api = createApp({ databasePath });
const state = { tests: [], attempts: [] };
for (const [exam, taskNumber, count] of [
  ["ОГЭ", 4, 4],
  ["ОГЭ", 6, 4],
  ["ОГЭ", 7, 2],
  ["ЕГЭ", 9, 1],
]) {
  for (let n = count; n >= 1; n--) {
    const id = `${exam}-${taskNumber}-${n}`;
    state.tests.push({
      ...structuredClone(demoTest),
      id,
      versionId: `${id}-v1`,
      shareToken: `${exam === "ОГЭ" ? "oge" : "ege"}-${taskNumber}-${n}-token`,
      exam,
      taskNumber,
      title: `${exam}. Задание № ${taskNumber}${count > 1 ? `. Тест ${n}` : ""}`,
    });
  }
}
for (const [id, exam, taskNumber, topic] of [
  ["commas", "ЕГЭ", 21, "Запятые"],
  ["dash", "ЕГЭ", 21, "Тире и двоеточие"],
  ["oge-commas", "ОГЭ", 5, "Запятые и кавычки"],
  ["oge-dash", "ОГЭ", 5, "Тире и двоеточие"],
]) {
  state.tests.push({
    ...structuredClone(demoTest),
    id,
    versionId: `${id}-v1`,
    shareToken: `${id}-token`,
    exam,
    taskNumber,
    title: `${exam}. Задание № ${taskNumber}. ${topic}`,
  });
}
for (const t of state.tests) {
  const actor = { id: `student-${t.id}`, teacher: false };
  const draft = execute(
    state,
    "start_attempt",
    {
      token: t.shareToken,
      name: `Проверка ${t.id}`,
      groupDay: "monday",
      groupTime: t.exam === "ОГЭ" ? "18:30" : "17:30",
    },
    actor,
  );
  execute(
    state,
    "submit_attempt",
    { attemptId: draft.id, answers: filledAnswers(t) },
    actor,
  );
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
  mkdirSync(".local/test-library", { recursive: true });
  const report = [];
  for (const [width, height] of [
    [1366, 768],
    [960, 650],
    [390, 844],
    [360, 800],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    context.setDefaultTimeout(10000);
    await context.route("**/api/rpc", async (route) => {
      const response = await route.fetch({
        url: apiUrl,
        headers: { origin: new URL(apiUrl).origin },
      });
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${webUrl}/#/teacher`);
    await page
      .getByRole("button", { name: "Открыть демонстрационный кабинет" })
      .click();
    await page.getByRole("heading", { name: /Библиотека тестов/ }).waitFor();
    assert.equal(await page.locator(".test-grid .test-card").count(), 11);
    assert.equal(await page.locator(".count-pill").textContent(), "11");
    assert.equal(
      await page
        .locator(".test-grid h3")
        .filter({ hasText: /Тест \d/ })
        .count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Больше тестов" }).count(),
      0,
    );
    for (const title of [
      "ЕГЭ. Задание № 21. Запятые",
      "ЕГЭ. Задание № 21. Тире и двоеточие",
      "ОГЭ. Задание № 5. Запятые и кавычки",
      "ОГЭ. Задание № 5. Тире и двоеточие",
    ]) {
      const topicCard = page.locator(".test-grid .test-card").filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      });
      assert.equal(await topicCard.count(), 1);
      assert.equal(
        await topicCard.getByRole("button", { name: "Больше тестов" }).count(),
        0,
      );
      assert.equal(
        await topicCard
          .getByRole("button", { name: "Поделиться ссылкой" })
          .count(),
        1,
      );
      assert.equal(
        await topicCard
          .getByRole("button", { name: "Результаты (1)", exact: true })
          .count(),
        1,
      );
      await topicCard
        .getByRole("button", { name: "Тест и ответы", exact: true })
        .click();
      const preview = page.getByRole("dialog", {
        name: "Предпросмотр теста",
        exact: true,
      });
      await preview.waitFor();
      assert.equal(await preview.locator("h3").first().textContent(), title);
      await preview
        .getByRole("button", { name: "Закрыть", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "ОГЭ", exact: true }).click();
    assert.equal(await page.locator(".test-grid .test-card").count(), 8);
    assert.equal(
      await page
        .locator(".test-grid h3")
        .filter({ hasText: /ДЗ №[34]|Тест [34]/ })
        .count(),
      0,
    );
    const layout = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(layout.page <= layout.viewport, JSON.stringify(layout));
    await page.screenshot({
      path: `.local/test-library/catalog-${width}.png`,
      fullPage: true,
    });
    for (const task of [4, 6, 7]) {
      for (const number of [1, 2]) {
        const title = `ОГЭ. Задание № ${task}. ДЗ №${number}`;
        const card = page.locator(".test-grid .test-card").filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        });
        assert.equal(await card.count(), 1);
        assert.equal(
          await card.getByRole("button", { name: "Больше тестов" }).count(),
          0,
        );
        const extra = card;
        const target = state.tests.find(
          (t) =>
            t.exam === "ОГЭ" &&
            t.taskNumber === task &&
            t.title.endsWith(`Тест ${number}`),
        );
        await extra.getByRole("button", { name: "Поделиться ссылкой" }).click();
        const share = page.getByRole("dialog", {
          name: "Поделиться тестом",
          exact: true,
        });
        assert.equal(
          await share.getByRole("textbox").inputValue(),
          `${webUrl}/#/test/${target.shareToken}`,
        );
        await share.getByRole("button", { name: "Скопировать ссылку" }).click();
        await share
          .getByRole("button", { name: "Скопировано", exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          `${webUrl}/#/test/${target.shareToken}`,
        );
        if (task === 4 && number === 2) {
          const popupPromise = page.waitForEvent("popup");
          await share.getByRole("link", { name: "Открыть тест" }).click();
          const popup = await popupPromise;
          await popup
            .getByRole("heading", { name: title, exact: true })
            .waitFor();
          await popup.reload();
          await popup
            .getByRole("heading", { name: title, exact: true })
            .waitFor();
          await popup.close();
        }
        await page.keyboard.press("Escape");
        await share.waitFor({ state: "detached" });
        assert.equal(
          await extra
            .getByRole("button", { name: "Поделиться ссылкой" })
            .evaluate((el) => document.activeElement === el),
          true,
        );
        await extra
          .getByRole("button", { name: "Тест и ответы", exact: true })
          .click();
        const preview = page.getByRole("dialog", {
          name: "Предпросмотр теста",
          exact: true,
        });
        await preview.waitFor();
        assert.equal(await preview.locator("h3").first().textContent(), title);
        await preview
          .getByRole("button", { name: "Закрыть", exact: true })
          .click();
        await preview.waitFor({ state: "detached" });
        await extra
          .getByRole("button", { name: "Результаты (1)", exact: true })
          .click();
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.equal(
          await page.locator(".results-test-field select").inputValue(),
          `ОГЭ-${task}-${number}`,
        );
        assert.equal(await page.locator("tbody tr").count(), 1);
        assert.ok(
          (await page.locator("tbody").textContent()).includes(
            `Проверка ОГЭ-${task}-${number}`,
          ),
        );
        const libraryNav = page.getByRole("button", {
          name: "Библиотека тестов",
          exact: true,
        });
        if (width <= 760)
          await page.getByRole("button", { name: "Открыть меню" }).click();
        await libraryNav.click();
      }
    }
    await page.reload();
    await page.getByRole("heading", { name: /Библиотека тестов/ }).waitFor();
    assert.equal(await page.locator(".test-grid .test-card").count(), 11);
    assert.deepEqual(errors, []);
    report.push({
      width,
      height,
      cards: 11,
      separateTopicsChecked: 4,
      homeworkCardsChecked: 6,
      errors,
    });
    await context.close();
  }
  writeFileSync(
    ".local/test-library/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await web.close();
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
