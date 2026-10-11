import { createClient } from "@supabase/supabase-js";
export const mode = import.meta.env.VITE_APP_MODE || "demo";
if (!["demo", "supabase"].includes(mode))
  throw new Error("Неизвестный режим приложения.");
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = (storageKey: string) => ({
  auth: {
    storageKey,
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});
const teacher =
  mode === "supabase" && url && key
    ? createClient(url, key, options("rns-teacher-auth"))
    : null;
const student =
  mode === "supabase" && url && key
    ? createClient(url, key, options("rns-student-auth"))
    : null;
export const captchaKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
let studentSignIn: Promise<void> | null = null;
export async function rpc<T>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (mode === "demo") {
    const response = await fetch(
      `${import.meta.env.BASE_URL}api/rpc`.replace(/\/+/g, "/"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, args }),
      },
    );
    let json;
    try {
      json = await response.json();
    } catch {
      throw new Error(
        "Локальный сервер не отвечает. Запустите npm run dev. Для опубликованного сайта подключите Supabase.",
      );
    }
    if (!response.ok)
      throw new Error(json.error || "Не удалось выполнить запрос.");
    return json.data;
  }
  const client = action.startsWith("teacher_") ? teacher : student;
  if (!client)
    throw new Error("Supabase ещё не подключён. Проверьте настройки проекта.");
  if (!action.startsWith("teacher_")) {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      if (!studentSignIn)
        studentSignIn = (async () => {
          const { error } = await client.auth.signInAnonymously({
            options: {
              captchaToken:
                typeof args.captchaToken === "string"
                  ? args.captchaToken
                  : undefined,
            },
          });
          if (error)
            throw new Error(
              "Не удалось начать сессию ученика: " + error.message,
            );
        })().finally(() => {
          studentSignIn = null;
        });
      await studentSignIn;
    }
  }
  const { data, error } = await client.rpc(action, { p_args: args });
  if (error) throw new Error(error.message);
  return data as T;
}
export async function login(
  email: string,
  password: string,
  captchaToken?: string,
) {
  if (mode === "demo") return rpc("demo_login");
  if (!teacher) throw new Error("Supabase ещё не подключён.");
  const { error } = await teacher.auth.signInWithPassword({
    email: email.trim(),
    password,
    options: { captchaToken },
  });
  if (error?.code === "invalid_credentials")
    throw new Error("Неверный email или пароль.");
  if (error?.code === "email_not_confirmed")
    throw new Error(
      "Email преподавателя не подтверждён. Подтвердите аккаунт в Supabase.",
    );
  if (error) throw new Error(error.message);
}
export async function logout() {
  if (mode === "demo") await rpc("demo_logout");
  else await teacher?.auth.signOut();
}
export async function resetStudent() {
  if (mode === "demo") await rpc("reset_student");
  else await student?.auth.signOut();
}
