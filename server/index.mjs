import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initialState } from "./demo-content.mjs";
import { execute, AppError } from "./engine.mjs";
export function createApp({ databasePath = ".local/demo.sqlite" } = {}) {
  if (databasePath.startsWith(".local/"))
    mkdirSync(".local", { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(
    "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, teacher INTEGER NOT NULL DEFAULT 0);",
  );
  if (!db.prepare("SELECT id FROM app_state WHERE id=1").get())
    db.prepare("INSERT INTO app_state VALUES (1,?)").run(
      JSON.stringify(initialState()),
    );
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status, data) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    if (req.url === "/api/health")
      return reply(200, { mode: "demo", ok: true });
    if (req.url !== "/api/rpc" || req.method !== "POST")
      return reply(404, { error: "Не найдено." });
    // Local demo intentionally listens only on loopback. Reject cross-site calls.
    if (
      req.headers.origin &&
      ![`http://${req.headers.host}`, "http://127.0.0.1:5173"].includes(
        req.headers.origin,
      )
    )
      return reply(403, { error: "Запрос с другого сайта запрещён." });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536)
          throw new AppError("Слишком большой запрос.", 413);
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        throw new AppError("Некорректный запрос.");
      }
      const { action, args = {} } = input;
      if (typeof action !== "string" || !args || typeof args !== "object")
        throw new AppError("Некорректный запрос.");
      const cookies = Object.fromEntries(
        (req.headers.cookie || "")
          .split(";")
          .filter((x) => x.includes("="))
          .map((x) => x.trim().split("=")),
      );
      const cookieName =
        action.startsWith("teacher_") ||
        ["demo_login", "demo_logout"].includes(action)
          ? "rns_teacher"
          : "rns_student";
      let actor = db
        .prepare("SELECT id,teacher FROM sessions WHERE id=?")
        .get(cookies[cookieName] || "");
      if (action === "demo_logout") {
        if (actor) db.prepare("DELETE FROM sessions WHERE id=?").run(actor.id);
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
        );
        return reply(200, { data: true });
      }
      if (action === "reset_student") {
        if (actor) db.prepare("DELETE FROM sessions WHERE id=?").run(actor.id);
        actor = null;
      }
      if (!actor) {
        actor = { id: randomUUID(), teacher: action === "demo_login" ? 1 : 0 };
        db.prepare("INSERT INTO sessions VALUES (?,?)").run(
          actor.id,
          actor.teacher,
        );
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${actor.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
        );
      }
      if (action === "demo_login") {
        db.prepare("UPDATE sessions SET teacher=1 WHERE id=?").run(actor.id);
        actor.teacher = 1;
      }
      if (["demo_login", "reset_student"].includes(action))
        return reply(200, { data: true });
      db.exec("BEGIN IMMEDIATE");
      try {
        const state = JSON.parse(
          db.prepare("SELECT payload FROM app_state WHERE id=1").get().payload,
        );
        const data = execute(state, action, args, actor);
        db.prepare("UPDATE app_state SET payload=? WHERE id=1").run(
          JSON.stringify(state),
        );
        db.exec("COMMIT");
        reply(200, { data });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } catch (e) {
      reply(e.status || 500, {
        error:
          e instanceof AppError
            ? e.message
            : "Не удалось сохранить данные. Повторите запрос.",
      });
    }
  });
  server.on("close", () => db.close());
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createApp().listen(5174, "127.0.0.1", () =>
    console.log(
      "Демонстрационный API: http://127.0.0.1:5174 (только этот компьютер)",
    ),
  );
