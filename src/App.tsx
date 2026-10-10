import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileCheck2,
  GraduationCap,
  LayoutGrid,
  Leaf,
  Loader2,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  CircleHelp,
  ChevronRight,
  Clock3,
  AlertCircle,
  EyeOff,
  Eye,
  Undo2,
} from "lucide-react";
import {
  captchaKey,
  login,
  logout,
  mode,
  resetStudent,
  rpc,
  verify,
} from "./api";
import type { Attempt, Draft, Exercise, Overview, Test } from "./types";
// Omit the paper answer-sheet instruction in every web view, including history.
const webPrompt = (text: string | undefined) =>
  text?.replaceAll("Запишите номера ответов.", "").trim();
const testTitle = (test: Pick<Test, "exam" | "taskNumber">) =>
  `${test.exam}. Задание № ${test.taskNumber}`;
const estimatedDuration = (test: Pick<Test, "exam" | "taskNumber">) =>
  test.exam === "ЕГЭ" && test.taskNumber === 9 ? "20–30 минут" : "5–10 минут";
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const formatDuration = (seconds: number | null | undefined) => {
  if (seconds == null) return "Не записано";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours ? `${hours} ч ` : ""}${minutes || hours ? `${minutes} мин ` : ""}${rest} сек`;
};
const testUrl = (token: string) =>
  `${location.origin}${location.pathname}#/test/${token}`;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось выполнить действие.";
function Brand() {
  return (
    <a className="brand" href="#/teacher">
      <span className="brand-mark">
        <Leaf size={24} />
      </span>
      <span>
        русский
        <br />
        <strong>без страданий</strong>
      </span>
    </a>
  );
}
function Button({
  children,
  onClick,
  disabled = false,
  kind = "",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`button ${kind} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!captchaKey) return;
    let widget: string | undefined;
    let stopped = false;
    const render = () => {
      if (stopped || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, {
        sitekey: captchaKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      stopped = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, []);
  return captchaKey ? <div ref={ref} /> : null;
}
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/teacher");
  useEffect(() => {
    const handler = () => {
      setRoute(location.hash.slice(1) || "/teacher");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  if (route.startsWith("/test/") || route.startsWith("/homework/"))
    return <Student key={route} token={route.split("/")[2]} />;
  return <Teacher />;
}
function Teacher() {
  const [overview, setOverview] = useState<Overview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tab, setTab] = useState("tests"),
    [exam, setExam] = useState("Все"),
    [resultsExam, setResultsExam] = useState("Все"),
    [search, setSearch] = useState(""),
    [testFilter, setTestFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false),
    [lastHiddenId, setLastHiddenId] = useState<string | null>(null);
  const [shareTest, setShareTest] = useState<Test | null>(null),
    [preview, setPreview] = useState<Test | null>(null),
    [detail, setDetail] = useState<Attempt | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const data = await rpc<Overview>("teacher_overview");
      setOverview(data);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  async function showPreview(t: Test) {
    setBusy(true);
    try {
      setPreview(
        await rpc<Test>("teacher_preview", {
          testId: t.id,
          versionId: t.versionId,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function showResult(a: Attempt) {
    setBusy(true);
    try {
      setDetail(await rpc<Attempt>("teacher_result", { attemptId: a.id }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function setResultHidden(attemptId: string, hidden: boolean) {
    setBusy(true);
    try {
      const saved = await rpc<{ id: string; teacherHidden: boolean }>(
        "teacher_set_result_hidden",
        { attemptId, hidden },
      );
      setOverview(
        (current) =>
          current && {
            ...current,
            results: current.results.map((r) =>
              r.id === saved.id
                ? { ...r, teacherHidden: saved.teacherHidden }
                : r,
            ),
          },
      );
      setLastHiddenId(hidden ? saved.id : null);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!overview)
    return <TeacherLogin loading={loading} error={error} onSuccess={load} />;
  const tests = overview.tests
    .filter((t) => exam === "Все" || t.exam === exam)
    .sort((a, b) => {
      const examOrder = (value: string) => (value === "ЕГЭ" ? 0 : 1);
      return (
        examOrder(a.exam) - examOrder(b.exam) || a.taskNumber - b.taskNumber
      );
    });
  const resultTests = Array.from(
    new Map([
      ...overview.results.map(
        (r) =>
          [
            r.testId,
            {
              id: r.testId,
              exam: r.exam,
              taskNumber: r.taskNumber,
            },
          ] as const,
      ),
      ...overview.tests.map((t) => [t.id, t] as const),
    ]).values(),
  )
    .filter((t) => resultsExam === "Все" || t.exam === resultsExam)
    .sort(
      (a, b) =>
        (a.exam === "ЕГЭ" ? 0 : 1) - (b.exam === "ЕГЭ" ? 0 : 1) ||
        a.taskNumber - b.taskNumber,
    );
  const visibleCount = overview.results.filter((r) => !r.teacherHidden).length;
  const filteredResults = overview.results
    .filter(
      (r) =>
        (resultsExam === "Все" || r.exam === resultsExam) &&
        r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (!testFilter || r.testId === testFilter),
    )
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  const hiddenCount = filteredResults.filter((r) => r.teacherHidden).length;
  const results = filteredResults.filter(
    (r) => Boolean(r.teacherHidden) === showHidden,
  );
  const tabs = [
    { id: "tests", label: "Библиотека тестов", icon: BookOpen },
    { id: "results", label: "Результаты", icon: LayoutGrid },
  ];
  return (
    <div className="teacher-layout">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <Brand />
        <div className="workspace-label">КАБИНЕТ ПРЕПОДАВАТЕЛЯ</div>
        <nav aria-label="Главное меню">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setMobileMenu(false);
              }}
              className={`nav-item ${tab === id ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "results" && visibleCount > 0 && (
                <span className="nav-count">{visibleCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">П</span>
          <div>
            <strong>Преподаватель</strong>
            <small>
              {mode === "demo" ? "Демонстрационный кабинет" : "Личный кабинет"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Выйти"
            onClick={async () => {
              await logout();
              setOverview(null);
              setError("");
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="teacher-body">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Кабинет <ChevronRight size={14} />{" "}
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </span>
        </header>
        <main className="main-content">
          <ErrorBox message={error} />
          {tab === "tests" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    Библиотека тестов{" "}
                    <span className="count-pill">{overview.tests.length}</span>
                  </h2>
                  <p>Каждый тест — практика одного номера экзамена</p>
                </div>
              </div>
              <div className="filter-row">
                <div className="segmented">
                  {["Все", "ЕГЭ", "ОГЭ"].map((e) => (
                    <button
                      key={e}
                      className={exam === e ? "selected" : ""}
                      onClick={() => setExam(e)}
                    >
                      {e === "Все" ? "Все тесты" : e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="test-grid">
                {tests.map((t) => (
                  <article key={t.id} className="test-card">
                    <div className="test-illustration" aria-hidden="true">
                      <span>А</span>
                      <span className="stress-mark">́</span>
                      <div className="illustration-check">
                        <Check size={17} />
                      </div>
                      <i>а</i>
                      <b>я</b>
                    </div>
                    <h3>{testTitle(t)}</h3>
                    <div className="test-facts">
                      <span>
                        <FileCheck2 size={15} />
                        {t.exerciseCount} упражнений
                      </span>
                      <span>
                        <Clock3 size={15} />≈ {estimatedDuration(t)}
                      </span>
                    </div>
                    <div className="test-card-actions">
                      <Button onClick={() => setShareTest(t)}>
                        Поделиться ссылкой <Copy size={17} />
                      </Button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => showPreview(t)}
                      >
                        Тест и ответы
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setResultsExam(t.exam);
                          setTestFilter(t.id);
                          setSearch("");
                          setShowHidden(false);
                          setTab("results");
                        }}
                      >
                        Результаты (
                        {
                          overview.results.filter(
                            (r) => r.testId === t.id && !r.teacherHidden,
                          ).length
                        }
                        )
                      </button>
                    </div>
                  </article>
                ))}
                {tests.length === 0 && (
                  <Empty
                    icon={<BookOpen />}
                    title="Материалы ещё не добавлены"
                    text="Передайте агенту файл с упражнениями и ключами — здесь появится тест по нужному номеру."
                  />
                )}
                <article className="next-test">
                  <span className="dashed-icon">
                    <Plus size={24} />
                  </span>
                  <h3>
                    Следующий тест —<br />
                    из ваших материалов
                  </h3>
                  <p>
                    Передайте PDF или другой файл
                    <br />
                    агенту в чате. Он подготовит
                    <br />
                    упражнения и ключи ответов.
                  </p>
                  <span className="light-label">Без ручного конструктора</span>
                </article>
              </div>
            </>
          )}
          {tab === "results" && (
            <>
              <div className="section-heading">
                <h2>
                  {showHidden ? "Скрытые работы" : "Работы учеников"}{" "}
                  <span className="count-pill">
                    {showHidden
                      ? overview.results.length - visibleCount
                      : visibleCount}
                  </span>
                </h2>
                <Button
                  kind="secondary"
                  onClick={load}
                  disabled={loading || busy}
                >
                  <RefreshCw size={16} />
                  Обновить
                </Button>
              </div>
              <div className="results-filters">
                <div
                  className="segmented results-exam"
                  role="group"
                  aria-label="Фильтр результатов по экзамену"
                >
                  {["Все", "ЕГЭ", "ОГЭ"].map((e) => (
                    <button
                      key={e}
                      className={resultsExam === e ? "selected" : ""}
                      aria-pressed={resultsExam === e}
                      onClick={() => {
                        setResultsExam(e);
                        if (
                          e !== "Все" &&
                          !resultTests.some(
                            (t) => t.id === testFilter && t.exam === e,
                          )
                        ) {
                          setTestFilter("");
                        }
                      }}
                    >
                      {e === "Все" ? "Все экзамены" : e}
                    </button>
                  ))}
                </div>
                <label className="results-test-field">
                  <span>Тест</span>
                  <select
                    value={testFilter}
                    onChange={(e) => setTestFilter(e.target.value)}
                  >
                    <option value="">
                      Все тесты{resultsExam === "Все" ? "" : ` ${resultsExam}`}
                    </option>
                    {resultTests.map((t) => (
                      <option key={t.id} value={t.id}>
                        {testTitle(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="results-name-field">
                  <span>Поиск по имени</span>
                  <span className="search-field">
                    <Search size={17} />
                    <input
                      placeholder="Имя ученика"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </span>
                </label>
              </div>
              <div className="results-visibility">
                <div
                  className="segmented"
                  role="group"
                  aria-label="Видимость работ"
                >
                  <button
                    className={!showHidden ? "selected" : ""}
                    aria-pressed={!showHidden}
                    onClick={() => setShowHidden(false)}
                  >
                    Работы <span>{filteredResults.length - hiddenCount}</span>
                  </button>
                  <button
                    className={showHidden ? "selected" : ""}
                    aria-pressed={showHidden}
                    onClick={() => setShowHidden(true)}
                  >
                    <EyeOff size={16} /> Скрытые <span>{hiddenCount}</span>
                  </button>
                </div>
                {lastHiddenId && (
                  <div className="result-hidden-notice" role="status">
                    <span>Работа скрыта</span>
                    <button
                      className="text-button"
                      disabled={busy || loading}
                      onClick={() => setResultHidden(lastHiddenId, false)}
                    >
                      <Undo2 size={16} /> Отменить
                    </button>
                  </div>
                )}
              </div>
              {results.length === 0 ? (
                <Empty
                  icon={<FileCheck2 />}
                  title={
                    showHidden
                      ? "Скрытых работ нет"
                      : overview.results.length
                        ? "Работы не найдены"
                        : "Результаты появятся здесь"
                  }
                  text={
                    showHidden
                      ? "Здесь появятся скрытые работы. Их можно будет вернуть в основной список."
                      : hiddenCount > 0
                        ? "Проверьте список «Скрытые» или выберите другой экзамен, тест или имя."
                        : overview.results.length
                          ? "Попробуйте выбрать другой экзамен, тест или имя."
                          : "Как только ученик отправит работу, вы увидите его ответы и результат."
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ученик</th>
                        <th>Тест</th>
                        <th>Результат</th>
                        <th>Время прохождения</th>
                        <th>Отправлено</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                          </td>
                          <td>{testTitle(r)}</td>
                          <td>
                            <span
                              className={`score-pill ${r.percentage >= 70 ? "good" : "needs-work"}`}
                            >
                              {r.percentage}%
                            </span>
                            <small>
                              {r.correct} из {r.total}
                            </small>
                          </td>
                          <td>{formatDuration(r.durationSeconds)}</td>
                          <td>{formatDate(r.submittedAt)}</td>
                          <td>
                            <div className="result-row-actions">
                              <button
                                className="text-button"
                                disabled={busy || loading}
                                onClick={() => showResult(r)}
                              >
                                Открыть <ChevronRight size={15} />
                              </button>
                              <button
                                className="text-button"
                                disabled={busy || loading}
                                aria-label={`${showHidden ? "Вернуть" : "Скрыть"} работу: ${r.name}, ${testTitle(r)}`}
                                onClick={() =>
                                  setResultHidden(r.id, !showHidden)
                                }
                              >
                                {showHidden ? (
                                  <Eye size={15} />
                                ) : (
                                  <EyeOff size={15} />
                                )}
                                {showHidden ? "Вернуть" : "Скрыть"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {shareTest && (
        <ShareModal test={shareTest} onClose={() => setShareTest(null)} />
      )}
      {preview && (
        <Modal title="Предпросмотр теста" onClose={() => setPreview(null)}>
          <h3>{testTitle(preview)}</h3>
          <Review exercises={preview.exercises} preview />
        </Modal>
      )}
      {detail && (
        <Modal title={`Работа: ${detail.name}`} onClose={() => setDetail(null)}>
          <div className="detail-meta">
            <span>{testTitle(detail)}</span>
            <strong>
              {detail.correct} из {detail.total} · {detail.percentage}%
            </strong>
          </div>
          <p className="muted">
            Время прохождения: {formatDuration(detail.durationSeconds)}
          </p>
          <Review exercises={detail.exercises} />
        </Modal>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function TeacherLogin({
  loading,
  error,
  onSuccess,
}: {
  loading: boolean;
  error: string;
  onSuccess: () => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState(""),
    [captcha, setCaptcha] = useState("");
  async function submit() {
    setBusy(true);
    setLocalError("");
    try {
      if (sent) {
        await verify(email, code);
        await onSuccess();
      } else {
        await login(email, captcha);
        if (mode === "demo") await onSuccess();
        else setSent(true);
      }
    } catch (e) {
      setLocalError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <Brand />
      <main className="login-card">
        <div className="eyebrow">КАБИНЕТ ПРЕПОДАВАТЕЛЯ</div>
        <h1>
          Практика начинается
          <br />
          <em>с простого шага.</em>
        </h1>
        <p>Тесты по номерам, прямые ссылки и ответы каждого ученика.</p>
        {loading ? (
          <div className="loading">
            <Loader2 className="spin" /> Проверяем доступ…
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {mode === "demo" ? (
              <div className="demo-login-note">
                <CircleHelp size={19} />
                <span>
                  Это локальный демонстрационный кабинет. Здесь можно проверить
                  весь сценарий на этом компьютере. Для настоящего входа
                  преподавателя подключите Supabase.
                </span>
              </div>
            ) : (
              <>
                <label className="field-label">
                  Email преподавателя
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    disabled={sent}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                {sent && (
                  <>
                    <label className="field-label">
                      Код из письма
                      <input
                        required
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.trim())}
                        placeholder="Введите код"
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setSent(false);
                        setCode("");
                      }}
                    >
                      Запросить новый код
                    </button>
                  </>
                )}
                <Captcha onToken={setCaptcha} />
              </>
            )}
            <ErrorBox
              message={localError || (mode === "supabase" ? error : "")}
            />
            <Button
              type="submit"
              disabled={
                busy ||
                (mode === "supabase" && !sent && !!captchaKey && !captcha)
              }
            >
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {mode === "demo"
                ? "Открыть демонстрационный кабинет"
                : sent
                  ? "Войти"
                  : "Получить код на почту"}
              <ArrowRight size={18} />
            </Button>
          </form>
        )}
        <span className="login-foot">
          Ученикам вход в кабинет не нужен — только ссылка на тест.
        </span>
      </main>
      <footer>Русский без страданий · учиться можно спокойно</footer>
    </div>
  );
}
function ShareModal({ test, onClose }: { test: Test; onClose: () => void }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Поделиться тестом" onClose={onClose}>
      <h3>{testTitle(test)}</h3>
      <p>Отправьте ссылку ученикам. Им понадобится только имя.</p>
      <label className="field-label">
        Ссылка на тест
        <input
          readOnly
          value={testUrl(test.shareToken)}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="button-row">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(testUrl(test.shareToken));
              setCopied(true);
              setError("");
            } catch {
              setError("Выделите и скопируйте ссылку из поля выше.");
            }
          }}
        >
          <Copy size={16} />
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </Button>
        <a
          className="button secondary"
          href={`#/test/${test.shareToken}`}
          target="_blank"
          rel="noreferrer"
        >
          Открыть тест <ArrowUpRight size={17} />
        </a>
      </div>
      {mode === "demo" && (
        <p className="helper">
          Локальная ссылка работает только на этом компьютере.
        </p>
      )}
      <ErrorBox message={error} />
    </Modal>
  );
}
function readableAnswer(e: Exercise, answer: unknown) {
  if (Array.isArray(answer))
    return answer.length
      ? answer
          .map((id) => e.options?.find((o) => o.id === id)?.text || id)
          .join(", ")
      : "Нет ответа";
  return typeof answer === "string" && answer ? answer : "Нет ответа";
}
function Review({
  exercises,
  preview = false,
}: {
  exercises: Exercise[];
  preview?: boolean;
}) {
  return (
    <div className="review-list">
      {exercises.map((e, i) => (
        <article
          className={`review-item ${preview ? "preview" : e.correct ? "correct" : "incorrect"}`}
          key={e.id}
        >
          <div className="review-top">
            <span>Упражнение {i + 1}</span>
            {!preview && (
              <strong>
                {e.correct ? (
                  <>
                    <CheckCircle2 size={16} />
                    Верно
                  </>
                ) : (
                  <>
                    <X size={16} />
                    Ошибка
                  </>
                )}
              </strong>
            )}
          </div>
          <h4>{webPrompt(e.prompt)}</h4>
          {preview && (
            <div className="preview-options">
              {e.options?.map((o) => (
                <span key={o.id}>
                  {o.id}. {o.text}
                </span>
              ))}
            </div>
          )}
          {preview && e.type !== "text" && !!e.options?.length && (
            <p>
              <span className="muted">Номера правильных ответов:</span>{" "}
              <strong>
                {e.options
                  .filter((o) =>
                    (e.correctAnswer || e.key || []).includes(o.id),
                  )
                  .map((o) => o.id)
                  .join("") || "Не указаны"}
              </strong>
            </p>
          )}
          {!preview && (
            <p>
              <span className="muted">Ответ ученика:</span>{" "}
              {readableAnswer(e, e.rawAnswer)}
            </p>
          )}
          {(!preview || e.type === "text") && (
            <p>
              <span className="muted">Правильный ответ:</span>{" "}
              <strong>{readableAnswer(e, e.correctAnswer || e.key)}</strong>
            </p>
          )}
          {!preview && e.explanation?.trim() && (
            <div className="explanation">{e.explanation}</div>
          )}
        </article>
      ))}
    </div>
  );
}
function Student({ token }: { token: string }) {
  const [test, setTest] = useState<Test | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [name, setName] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [result, setResult] = useState<Attempt | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [ready, setReady] = useState(!captchaKey),
    [storageWarning, setStorageWarning] = useState(false),
    [recoveryFailed, setRecoveryFailed] = useState(false);
  const storageKey = `rns-draft:${mode}:${token}`;
  const resultKey = `rns-result:${mode}:${token}`;
  const onCaptcha = (value: string) => {
    setCaptcha(value);
    if (value) setReady(true);
  };
  async function load() {
    setLoading(true);
    setError("");
    setRecoveryFailed(false);
    try {
      const a = await rpc<Test>("get_test", {
        token,
        captchaToken: captcha,
      });
      setTest(a);
      let saved;
      try {
        const s = localStorage.getItem(storageKey);
        const last = localStorage.getItem(resultKey);
        if (s) saved = JSON.parse(s);
        else if (last) saved = { id: last };
      } catch {
        setStorageWarning(true);
      }
      if (saved?.id) {
        try {
          const p = await rpc<Attempt>("get_attempt", { attemptId: saved.id });
          if (p.status === "submitted") {
            setResult(p);
            try {
              localStorage.setItem(resultKey, p.id);
              localStorage.removeItem(storageKey);
            } catch {
              setStorageWarning(true);
            }
          } else if (saved.versionId === a.versionId) {
            setDraft(saved);
            setName(saved.name);
          }
        } catch (e) {
          // A temporary failure must never erase an unsubmitted draft.
          if (!errorText(e).includes("Попытка недоступна")) {
            setRecoveryFailed(true);
            throw new Error(
              "Не удалось восстановить работу. Черновик сохранён. Нажмите «Повторить восстановление».",
            );
          }
          try {
            localStorage.removeItem(storageKey);
            localStorage.removeItem(resultKey);
          } catch {
            setStorageWarning(true);
          }
        }
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (ready) void load();
    else setLoading(false);
  }, [ready]);
  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setStorageWarning(true);
    }
  }, [draft]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const p = await rpc<{ id: string; versionId: string; name: string }>(
        "start_attempt",
        { token, name },
      );
      setDraft({ ...p, answers: {}, position: 0 });
      setResult(null);
      try {
        localStorage.removeItem(resultKey);
      } catch {
        setStorageWarning(true);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!draft) return;
    setConfirm(false);
    setBusy(true);
    setError("");
    try {
      const r = await rpc<Attempt>("submit_attempt", {
        attemptId: draft.id,
        answers: draft.answers,
      });
      setResult(r);
      setDraft(null);
      try {
        localStorage.setItem(resultKey, r.id);
        localStorage.removeItem(storageKey);
      } catch {
        setStorageWarning(true);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const exercise = test?.exercises[draft?.position || 0];
  const answered =
    draft && test
      ? test.exercises.filter((e) => {
          const a = draft.answers[e.id];
          return Array.isArray(a)
            ? a.length > 0
            : typeof a === "string" && a.length > 0;
        }).length
      : 0;
  function choose(value: string) {
    if (!draft || !exercise) return;
    let answer: string | string[] = value;
    if (exercise.type === "multiple") {
      const old = draft.answers[exercise.id];
      const selected = Array.isArray(old) ? old : [];
      answer = selected.includes(value)
        ? selected.filter((x) => x !== value)
        : [...selected, value];
    }
    setDraft({
      ...draft,
      answers: { ...draft.answers, [exercise.id]: answer },
    });
  }
  return (
    <div className="student-page">
      <header className="student-header">
        <Brand />
        <span className="light-label">
          <Leaf size={16} /> Практика без спешки
        </span>
      </header>
      <main className={`student-main ${result ? "wide" : ""}`}>
        {!ready ? (
          <div className="student-intro">
            <div className="eyebrow">ТЕСТ</div>
            <h1>Сначала маленькая проверка</h1>
            <p>Подтвердите, что вы человек, чтобы открыть задание.</p>
            <Captcha onToken={onCaptcha} />
          </div>
        ) : loading ? (
          <div className="loading">
            <Loader2 className="spin" /> Открываем тест…
          </div>
        ) : !test ? (
          <div className="student-intro">
            <h1>Не получилось открыть работу</h1>
            <ErrorBox message={error} />
            <Button onClick={load}>Попробовать ещё раз</Button>
          </div>
        ) : result ? (
          <>
            <div className="result-hero">
              <span className="result-check">
                <CheckCircle2 size={36} />
              </span>
              <div className="eyebrow">РАБОТА ЗАВЕРШЕНА</div>
              <h1>
                {result.percentage >= 80
                  ? "Отличная работа!"
                  : result.percentage >= 50
                    ? "Хорошее начало!"
                    : "Разберём ответы и потренируемся ещё."}
              </h1>
              <p>{result.name}, теперь можно спокойно разобрать ответы.</p>
              <div className="result-score">
                <strong>
                  {result.percentage}
                  <span>%</span>
                </strong>
                <p>
                  {result.correct} из {result.total} упражнений выполнено верно
                </p>
              </div>
              <p>Время прохождения: {formatDuration(result.durationSeconds)}</p>
              <div className="result-saved">
                <Check size={17} />
                {mode === "demo"
                  ? "Результат сохранён в локальном демонстрационном кабинете."
                  : "Результат сохранён и доступен преподавателю."}
              </div>
              <p className="helper">
                Это результат теста, а не экзаменационный балл.
              </p>
              <Button
                kind="secondary"
                onClick={() => {
                  setResult(null);
                }}
              >
                <RefreshCw size={17} /> Пройти ещё раз
              </Button>
            </div>
            <div className="section-heading">
              <h2>Разбор упражнений</h2>
              <span className="light-label">
                {test?.exam} № {test?.taskNumber}
              </span>
            </div>
            <Review exercises={result.exercises} />
          </>
        ) : !draft ? (
          <div className="student-intro">
            <span className="exam-tag">
              {test?.exam} № {test?.taskNumber}{" "}
              {test?.demo && <span>· Демо</span>}
            </span>
            <div className="student-illustration" aria-hidden="true">
              <GraduationCap size={52} />
            </div>
            <h1>{testTitle(test)}</h1>
            <p className="intro-description">{webPrompt(test?.description)}</p>
            <div className="student-test-facts">
              <span>
                <FileCheck2 size={17} />
                {test?.exerciseCount} упражнений
              </span>
              <span>
                <Clock3 size={17} />≈ {estimatedDuration(test)}
              </span>
            </div>
            {test.status !== "published" ? (
              <div className="error-box">
                Приём новых работ завершён. Если вы уже начали работу в этом
                браузере, она восстановится автоматически.
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void start();
                }}
              >
                <label className="field-label">
                  Как вас зовут?
                  <input
                    required
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Маша Иванова"
                  />
                </label>
                <p className="helper">
                  Имя и ответы сохраняются и доступны вашему преподавателю.
                  Email и пароль не нужны.
                </p>
                <p className="helper">
                  Время прохождения считается после нажатия «Начать практику» до
                  отправки ответов, включая перерывы.
                </p>
                <ErrorBox message={error} />
                {recoveryFailed && (
                  <Button kind="secondary" onClick={load}>
                    Повторить восстановление
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={busy || !name.trim() || recoveryFailed}
                >
                  {busy ? <Loader2 size={18} className="spin" /> : null}Начать
                  практику <ArrowRight size={18} />
                </Button>
              </form>
            )}
            <p className="source-note">{test?.source}</p>
          </div>
        ) : (
          <>
            <div className="quiz-heading">
              <div>
                <span className="exam-tag">
                  {test?.exam} № {test?.taskNumber}
                </span>
                <h2>{testTitle(test)}</h2>
              </div>
              <span className="student-name">{draft.name}</span>
            </div>
            <div className="progress-head">
              <span>
                Выполнено {answered} из {test?.exerciseCount}
              </span>
              <span>Упражнение {draft.position + 1}</span>
            </div>
            <div className="progress-track">
              <div
                style={{
                  width: `${(answered / (test?.exerciseCount || 1)) * 100}%`,
                }}
              />
            </div>
            <div className="question-tabs" aria-label="Упражнения">
              {test?.exercises.map((e, i) => {
                const a = draft.answers[e.id];
                const filled = Array.isArray(a) ? a.length > 0 : !!a;
                return (
                  <button
                    aria-label={`Упражнение ${i + 1}${filled ? ", ответ заполнен" : ""}`}
                    aria-current={draft.position === i ? "step" : undefined}
                    className={`${draft.position === i ? "current" : ""} ${filled ? "filled" : ""}`}
                    key={e.id}
                    onClick={() => setDraft({ ...draft, position: i })}
                  >
                    {filled && draft.position !== i ? (
                      <Check size={17} />
                    ) : (
                      i + 1
                    )}
                  </button>
                );
              })}
            </div>
            <section className="question-card" key={exercise?.id}>
              <div className="eyebrow">
                УПРАЖНЕНИЕ {draft.position + 1} ИЗ {test?.exerciseCount}
              </div>
              <h1>{webPrompt(exercise?.prompt)}</h1>
              <p className="question-hint">
                {exercise?.type === "multiple"
                  ? "Выберите все подходящие варианты. Может быть несколько ответов."
                  : exercise?.type === "single"
                    ? "Выберите один вариант."
                    : "Введите короткий ответ."}
              </p>
              {exercise?.type === "text" ? (
                <label className="field-label">
                  Ваш ответ
                  <input
                    value={
                      typeof draft.answers[exercise.id] === "string"
                        ? (draft.answers[exercise.id] as string)
                        : ""
                    }
                    onChange={(e) => choose(e.target.value)}
                    maxLength={2000}
                  />
                </label>
              ) : (
                <div className="answer-options">
                  {exercise?.options?.map((o) => {
                    const a = draft.answers[exercise.id];
                    const checked = Array.isArray(a)
                      ? a.includes(o.id)
                      : a === o.id;
                    return (
                      <label
                        className={`answer-option ${checked ? "chosen" : ""}`}
                        key={o.id}
                      >
                        <input
                          type={
                            exercise.type === "multiple" ? "checkbox" : "radio"
                          }
                          name={exercise.id}
                          checked={checked}
                          onChange={() => choose(o.id)}
                        />
                        <span className="option-number">{o.id}</span>
                        <span className="option-word">{o.text}</span>
                        <span className="option-check">
                          {checked ? <Check size={17} /> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <ErrorBox message={error} />
              <div className="quiz-controls">
                <Button
                  kind="secondary"
                  disabled={draft.position === 0 || busy}
                  onClick={() =>
                    setDraft({ ...draft, position: draft.position - 1 })
                  }
                >
                  <ArrowLeft size={17} />
                  Назад
                </Button>
                {draft.position < (test?.exerciseCount || 0) - 1 ? (
                  <Button
                    onClick={() =>
                      setDraft({ ...draft, position: draft.position + 1 })
                    }
                  >
                    Дальше <ArrowRight size={17} />
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => setConfirm(true)}>
                    {busy ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Завершить и проверить
                  </Button>
                )}
              </div>
            </section>
            <p className="autosave">
              <ShieldCheck size={14} />
              {storageWarning
                ? "Браузер не разрешил сохранить черновик. Не закрывайте страницу до отправки."
                : "Черновик сохраняется в этом браузере. Можно вернуться к предыдущим ответам."}
            </p>
          </>
        )}
        {test && !draft && (
          <button
            className="text-button another-student"
            onClick={async () => {
              try {
                await resetStudent();
                try {
                  for (const k of Object.keys(localStorage))
                    if (
                      k.startsWith("rns-draft:") ||
                      k.startsWith("rns-result:")
                    )
                      localStorage.removeItem(k);
                } catch {
                  setStorageWarning(true);
                }
                setDraft(null);
                setResult(null);
                setName("");
                if (captchaKey) {
                  setReady(false);
                  setCaptcha("");
                  setTest(null);
                } else {
                  await load();
                }
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Другой ученик на этом устройстве
          </button>
        )}
      </main>
      <footer className="student-footer">
        Русский без страданий <span>·</span> маленькая практика, большой
        прогресс
      </footer>
      {confirm && (
        <Modal title="Завершить работу?" onClose={() => setConfirm(false)}>
          <p>
            {answered === (test?.exerciseCount || 0)
              ? "Все упражнения заполнены. После отправки вы увидите результат и правильные ответы."
              : `Осталось без ответа: ${(test?.exerciseCount || 0) - answered}. Пропуски будут засчитаны как ошибки.`}
          </p>
          <p className="helper">
            Отправленные ответы изменить нельзя. Можно будет пройти тест заново.
          </p>
          <div className="button-row">
            <Button kind="secondary" onClick={() => setConfirm(false)}>
              Вернуться к работе
            </Button>
            <Button onClick={submit}>
              Отправить ответы <Check size={17} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
