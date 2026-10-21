import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
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
import { captchaKey, login, logout, mode, rpc, teacherOverview } from "./api";
import type { Answer, Attempt, Draft, Exercise, Overview, Test } from "./types";
import { summarizeResults } from "./results-summary";
import { formatReviewAnswer } from "./review-answer";
import { exerciseSections } from "./exercise-sections";
import { submissionErrorText, submitWithRetry } from "./submission";
import { compareTests } from "./test-order";
import {
  additionalTestTitle,
  groupLibraryTests,
  testTopicTitle,
  testDisplayTitle as testTitle,
} from "./test-library";
import { MatchingTable, MatchingAnswer } from "./MatchingExercise";
import {
  answerFilled,
  missingAnswers,
} from "../shared/answer-completeness.mjs";
import studentGroups from "../shared/student-groups.json";
const groupsForExam = (exam: string | undefined) =>
  exam === "ЕГЭ" ? studentGroups.ЕГЭ : exam === "ОГЭ" ? studentGroups.ОГЭ : [];
// Omit the paper answer-sheet instruction in every web view, including history.
const webPrompt = (text: string | undefined) =>
  text?.replaceAll("Запишите номера ответов.", "").trim();
function PromptText({ text }: { text: string | undefined }) {
  const [instruction, ...paragraphs] = (webPrompt(text) || "").split(/\n\s*\n/);
  return (
    <>
      {paragraphs.length ? (
        <span className="prompt-instruction">{instruction}</span>
      ) : (
        instruction
      )}
      {!!paragraphs.length && (
        <span className="prompt-passage">{paragraphs.join("\n\n")}</span>
      )}
    </>
  );
}
function ReadingPassage({ exercise }: { exercise: Exercise }) {
  const text = exercise.passage || "";
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of exercise.passageHighlights || []) {
    if (start < cursor || end <= start || end > text.length) continue;
    parts.push(text.slice(cursor, start));
    parts.push(<strong key={start}>{text.slice(start, end)}</strong>);
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return <div className="reading-passage">{parts}</div>;
}
const estimatedDuration = (
  test: Pick<Test, "exam" | "taskNumber" | "estimatedDuration">,
) =>
  test.estimatedDuration ||
  (test.exam === "ЕГЭ" && test.taskNumber === 9 ? "20–30 минут" : "5–10 минут");
const exerciseCountText = (count: number) => {
  const ending =
    count % 100 >= 11 && count % 100 <= 14
      ? "упражнений"
      : count % 10 === 1
        ? "упражнение"
        : count % 10 >= 2 && count % 10 <= 4
          ? "упражнения"
          : "упражнений";
  return `${count} ${ending}`;
};
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
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const previousFocus = document.activeElement;
    d?.showModal();
    return () => {
      d?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
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
  const [moreTestsKey, setMoreTestsKey] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false),
    [busy, setBusy] = useState(false);
  const overviewVersion = useRef(0),
    refreshRequest = useRef(0),
    markingSeen = useRef(false);
  const load = async (background = false) => {
    const request = ++refreshRequest.current;
    const version = overviewVersion.current;
    if (!background) setLoading(true);
    try {
      const data = await teacherOverview();
      if (
        request !== refreshRequest.current ||
        version !== overviewVersion.current
      )
        return;
      setOverview(data);
      if (!background) setError("");
    } catch (e) {
      if (!background) setError(errorText(e));
    } finally {
      if (!background) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const hasOverview = overview !== null;
  useEffect(() => {
    if (!hasOverview || busy) return;
    const refresh = () => {
      if (!document.hidden && !markingSeen.current) void load(true);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [hasOverview, busy]);
  useEffect(() => {
    if (
      tab !== "results" ||
      !overview ||
      markingSeen.current ||
      busy ||
      document.hidden
    )
      return;
    const ids = overview.results
      .filter((r) => r.teacherUnread)
      .map((r) => r.id);
    if (!ids.length) return;
    markingSeen.current = true;
    void (async () => {
      try {
        for (let offset = 0; offset < ids.length; offset += 500) {
          const { seenIds } = await rpc<{ seenIds: string[] }>(
            "teacher_mark_results_seen",
            { attemptIds: ids.slice(offset, offset + 500) },
          );
          overviewVersion.current += 1;
          setOverview(
            (current) =>
              current && {
                ...current,
                results: current.results.map((r) =>
                  seenIds.includes(r.id) ? { ...r, teacherUnread: false } : r,
                ),
              },
          );
        }
      } catch (e) {
        setError(`Не удалось отметить работы просмотренными. ${errorText(e)}`);
      } finally {
        markingSeen.current = false;
      }
    })();
  }, [tab, overview, busy]);
  function openResults() {
    setTab("results");
    void load();
  }
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
      overviewVersion.current += 1;
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
    return (
      <TeacherLogin loading={loading} error={error} onSuccess={() => load()} />
    );
  const libraryGroups = groupLibraryTests(overview.tests);
  const tests = libraryGroups.filter(
    (group) => exam === "Все" || group.tests[0].exam === exam,
  );
  const moreTests = libraryGroups.find((group) => group.key === moreTestsKey);
  function showTestResults(t: Test) {
    setMoreTestsKey(null);
    setResultsExam(t.exam);
    setTestFilter(t.id);
    setSearch("");
    setShowHidden(false);
    openResults();
  }
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
              title: r.testTitle,
            },
          ] as const,
      ),
      ...overview.tests.map((t) => [t.id, t] as const),
    ]).values(),
  )
    .filter((t) => resultsExam === "Все" || t.exam === resultsExam)
    .sort(compareTests);
  const unreadCount = overview.results.filter(
    (r) => r.teacherUnread && !r.teacherHidden,
  ).length;
  const orderedResults = [...overview.results].sort(
    (a, b) =>
      Date.parse(b.submittedAt) - Date.parse(a.submittedAt) ||
      b.id.localeCompare(a.id),
  );
  const submissionNumbers = new Map(
    orderedResults.map((r, index) => [r.id, orderedResults.length - index]),
  );
  const filteredResults = orderedResults.filter(
    (r) =>
      (resultsExam === "Все" || r.exam === resultsExam) &&
      r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!testFilter || r.testId === testFilter),
  );
  const hiddenCount = filteredResults.filter((r) => r.teacherHidden).length;
  const results = filteredResults.filter(
    (r) => Boolean(r.teacherHidden) === showHidden,
  );
  const summary = summarizeResults(results);
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
                if (id === "results") openResults();
                else setTab(id);
                setMobileMenu(false);
              }}
              className={`nav-item ${tab === id ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "results" && unreadCount > 0 && (
                <span
                  className="nav-count"
                  role="status"
                  aria-label={`Новые прохождения: ${unreadCount}`}
                  title={`Новые прохождения: ${unreadCount}`}
                >
                  {unreadCount}
                </span>
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
              refreshRequest.current += 1;
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
                    <span className="count-pill">{libraryGroups.length}</span>
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
                {tests.map((group) => (
                  <TestCard
                    key={group.key}
                    test={group.tests[0]}
                    title={testTitle(group.tests[0]).replace(/\. Тест 1$/u, "")}
                    results={overview.results}
                    busy={busy}
                    onShare={setShareTest}
                    onPreview={showPreview}
                    onResults={showTestResults}
                    onMore={
                      group.tests.length > 1
                        ? () => setMoreTestsKey(group.key)
                        : undefined
                    }
                  />
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
                  <span className="count-pill">{results.length}</span>
                </h2>
                <Button
                  kind="secondary"
                  onClick={() => void load()}
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
              <dl
                className="results-summary"
                aria-label="Сводка по выбранным работам"
              >
                <div className="results-summary-item">
                  <dt>Количество прохождений</dt>
                  <dd>{summary.count}</dd>
                </div>
                <div className="results-summary-item">
                  <dt>Средняя доля верных ответов</dt>
                  <dd>
                    {summary.averagePercentage == null
                      ? "—"
                      : `${summary.averagePercentage}%`}
                  </dd>
                </div>
                <div className="results-summary-item">
                  <dt>Среднее время прохождения</dt>
                  <dd>
                    {summary.count
                      ? formatDuration(summary.averageDurationSeconds)
                      : "—"}
                  </dd>
                  {summary.timedCount < summary.count && (
                    <p className="results-summary-note">
                      Время записано у {summary.timedCount} из {summary.count}{" "}
                      работ
                    </p>
                  )}
                </div>
              </dl>
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
                        <th
                          className="result-order"
                          scope="col"
                          aria-label="Порядковый номер отправки"
                        >
                          №
                        </th>
                        <th>Ученик</th>
                        <th>Группа</th>
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
                          <td className="result-order">
                            {submissionNumbers.get(r.id)}
                          </td>
                          <td>
                            <strong>{r.name}</strong>
                          </td>
                          <td className="result-group">{r.group || "—"}</td>
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
                                className="result-open-button"
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
      {moreTests && (
        <Modal
          title={moreTests.title}
          className="more-tests-modal"
          onClose={() => setMoreTestsKey(null)}
        >
          <p>Дополнительные тесты по этому заданию</p>
          <ErrorBox message={error} />
          <div className="more-tests-list">
            {moreTests.tests.slice(1).map((t, index) => (
              <TestCard
                key={t.id}
                test={t}
                title={additionalTestTitle(t, index + 2)}
                description={testTopicTitle(t)}
                compact
                results={overview.results}
                busy={busy}
                onShare={setShareTest}
                onPreview={showPreview}
                onResults={showTestResults}
              />
            ))}
          </div>
        </Modal>
      )}
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
            <span>Группа: {detail.group || "Не указана"}</span>
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
function TestCard({
  test,
  title,
  description,
  results,
  busy,
  compact = false,
  onShare,
  onPreview,
  onResults,
  onMore,
}: {
  test: Test;
  title: string;
  description?: string;
  results: Attempt[];
  busy: boolean;
  compact?: boolean;
  onShare: (test: Test) => void;
  onPreview: (test: Test) => void;
  onResults: (test: Test) => void;
  onMore?: () => void;
}) {
  return (
    <article className="test-card">
      {!compact && (
        <div className="test-illustration" aria-hidden="true">
          <span>А</span>
          <span className="stress-mark">́</span>
          <div className="illustration-check">
            <Check size={17} />
          </div>
          <i>а</i>
          <b>я</b>
        </div>
      )}
      <h3>{title}</h3>
      {description && <p className="test-topic">{description}</p>}
      <div className="test-facts">
        <span>
          <FileCheck2 size={15} />
          {exerciseCountText(test.exerciseCount)}
          {test.maximumScore ? ` · ${test.maximumScore} баллов` : ""}
        </span>
        <span>
          <Clock3 size={15} />≈ {estimatedDuration(test)}
        </span>
      </div>
      <div className="test-card-actions">
        <Button onClick={() => onShare(test)}>
          Поделиться ссылкой <Copy size={17} />
        </Button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => onPreview(test)}
        >
          Тест и ответы
        </button>
        <button className="text-button" onClick={() => onResults(test)}>
          Результаты (
          {
            results.filter((r) => r.testId === test.id && !r.teacherHidden)
              .length
          }
          )
        </button>
      </div>
      {onMore && (
        <button
          className="text-button more-tests-button"
          aria-haspopup="dialog"
          onClick={onMore}
        >
          Больше тестов <ChevronRight size={15} />
        </button>
      )}
    </article>
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
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [captchaAttempt, setCaptchaAttempt] = useState(0);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setLocalError("");
    try {
      await login(email, password, captcha);
      setPassword("");
      await onSuccess();
    } catch (e) {
      setLocalError(errorText(e));
    } finally {
      // Turnstile tokens are single-use, including after a failed login.
      setCaptcha("");
      setCaptchaAttempt((value) => value + 1);
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
                    name="email"
                    autoComplete="username"
                    required
                    disabled={busy}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field-label">
                  Пароль
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>
                <Captcha key={captchaAttempt} onToken={setCaptcha} />
              </>
            )}
            <ErrorBox
              message={localError || (mode === "supabase" ? error : "")}
            />
            <Button
              type="submit"
              disabled={
                busy || (mode === "supabase" && !!captchaKey && !captcha)
              }
            >
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {mode === "demo" ? "Открыть демонстрационный кабинет" : "Войти"}
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
      <p>
        Отправьте ссылку ученикам. Перед началом они введут имя и выберут
        группу.
      </p>
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
function Review({
  exercises,
  preview = false,
  nested = false,
}: {
  exercises: Exercise[];
  preview?: boolean;
  nested?: boolean;
}) {
  const sections = exerciseSections(exercises);
  const sectionStarts = new Map(
    sections
      .filter((s) => !nested && s.taskNumber)
      .map((s) => [s.start, s.taskNumber]),
  );
  return (
    <div className="review-list">
      {exercises.map((e, i) => (
        <Fragment key={e.id}>
          {sectionStarts.has(i) && (
            <h3 className="review-section-heading">
              Задание № {sectionStarts.get(i)}
            </h3>
          )}
          <article
            className={`review-item ${preview ? "preview" : e.correct ? "correct" : "incorrect"}`}
          >
            <div className="review-top">
              <span>
                {nested
                  ? e.label || `Задание № ${e.taskNumber}`
                  : `Упражнение ${i + 1}`}
              </span>
              {!preview && (
                <strong>
                  {e.type === "group" || e.scoring ? (
                    `${e.score} из ${e.total} баллов`
                  ) : e.correct ? (
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
            <h4>
              <PromptText
                text={e.matchingTable ? e.prompt.split(/\n\s*\n/)[0] : e.prompt}
              />
            </h4>
            <MatchingTable exercise={e} />
            {e.passage && <ReadingPassage exercise={e} />}
            {e.type === "group" ? (
              <Review exercises={e.items || []} preview={preview} nested />
            ) : (
              <>
                {e.matchingTable && <MatchingAnswer exercise={e} />}
                {!!e.options?.length && (
                  <ol className="review-options" aria-label="Варианты ответов">
                    {e.options?.map((o) => (
                      <li key={o.id}>{o.text}</li>
                    ))}
                  </ol>
                )}
                {preview && e.type !== "text" && !!e.options?.length && (
                  <p>
                    <span className="muted">Номера правильных ответов:</span>{" "}
                    <strong>
                      {formatReviewAnswer(
                        e,
                        e.correctAnswer || e.key,
                        "Не указаны",
                      )}
                    </strong>
                  </p>
                )}
                {!preview && (
                  <p>
                    <span className="muted">
                      {e.type === "text"
                        ? "Ответ ученика:"
                        : "Выбранный ответ:"}
                    </span>{" "}
                    <strong>{formatReviewAnswer(e, e.rawAnswer)}</strong>
                  </p>
                )}
                {(!preview || e.type === "text") && (
                  <p>
                    <span className="muted">Правильный ответ:</span>{" "}
                    <strong>
                      {formatReviewAnswer(e, e.correctAnswer || e.key)}
                    </strong>
                  </p>
                )}
              </>
            )}
            {!preview && e.explanation?.trim() && (
              <div className="explanation">{e.explanation}</div>
            )}
          </article>
        </Fragment>
      ))}
    </div>
  );
}
function AnswerInput({
  exercise,
  answer,
  onChange,
  missing = false,
}: {
  exercise: Exercise;
  answer: Answer | undefined;
  onChange: (value: string | string[]) => void;
  missing?: boolean;
}) {
  return (
    <>
      {" "}
      {exercise.type === "text" && exercise.matchingTable && (
        <MatchingAnswer exercise={exercise} />
      )}
      {exercise.type !== "text" && (
        <p className="question-hint">
          {exercise.type === "multiple"
            ? "Выберите все подходящие варианты. Может быть несколько ответов."
            : "Выберите один вариант."}
        </p>
      )}
      {exercise.type === "text" && !!exercise.options?.length && (
        <ol className="reading-options">
          {exercise.options.map((o) => (
            <li key={o.id}>{o.text}</li>
          ))}
        </ol>
      )}
      {exercise.scoring?.type === "positional" && (
        <p className="question-hint">
          За 0–2 цифры на своих местах — 0 баллов, за 3–4 — 1 балл, за 5 — 2
          балла.
        </p>
      )}
      {exercise.type === "text" ? (
        <label className="field-label">
          Ваш ответ
          <input
            placeholder={
              exercise.answerPlaceholder ===
              "Введите слово или словосочетание без пробелов"
                ? "Введите слово или словосочетание без пробелов и запятых"
                : exercise.answerPlaceholder ||
                  "Без пробелов и запятых, например, 12"
            }
            value={typeof answer === "string" ? (answer as string) : ""}
            inputMode={exercise.matchingTable ? "numeric" : undefined}
            onChange={(e) => onChange(e.target.value)}
            maxLength={2000}
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `missing-${exercise.id}` : undefined}
          />
        </label>
      ) : (
        <div className="answer-options">
          {exercise.options?.map((o, optionIndex) => {
            const a = answer;
            const checked = Array.isArray(a) ? a.includes(o.id) : a === o.id;
            return (
              <label
                className={`answer-option ${checked ? "chosen" : ""}`}
                key={o.id}
              >
                <input
                  type={exercise.type === "multiple" ? "checkbox" : "radio"}
                  name={exercise.id}
                  aria-invalid={missing || undefined}
                  aria-describedby={
                    missing ? `missing-${exercise.id}` : undefined
                  }
                  checked={checked}
                  onChange={() => {
                    if (exercise.type === "multiple") {
                      const selected = Array.isArray(answer) ? answer : [];
                      onChange(
                        selected.includes(o.id)
                          ? selected.filter((id) => id !== o.id)
                          : [...selected, o.id],
                      );
                    } else {
                      onChange(o.id);
                    }
                  }}
                />
                <span className="option-number">{optionIndex + 1}</span>
                <span className="option-word">{o.text}</span>
                <span className="option-check">
                  {checked ? <Check size={17} /> : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
function Student({ token }: { token: string }) {
  const [test, setTest] = useState<Test | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [name, setName] = useState(""),
    [groupDay, setGroupDay] = useState(""),
    [groupTime, setGroupTime] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [result, setResult] = useState<Attempt | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [showMissing, setShowMissing] = useState(false),
    [validationAttempted, setValidationAttempted] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [ready, setReady] = useState(!captchaKey),
    [storageWarning, setStorageWarning] = useState(false),
    [recoveryFailed, setRecoveryFailed] = useState(false);
  const questionRef = useRef<HTMLElement>(null);
  const missing =
    draft && test ? missingAnswers(test.exercises, draft.answers) : [];
  function returnToMissing(position = missing[0]?.position) {
    setShowMissing(false);
    if (!draft || position === undefined) return;
    setDraft({ ...draft, position });
    requestAnimationFrame(() => {
      questionRef.current?.focus({ preventScroll: true });
      questionRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
  }
  function checkComplete() {
    setValidationAttempted(true);
    if (!missing.length) return true;
    setConfirm(false);
    setShowMissing(true);
    return false;
  }
  const storageKey = `rns-draft:${mode}:${token}`;
  const groups = groupsForExam(test?.exam);
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
          const schedule = groupsForExam(a.exam).find((group) =>
            group.times.some((time) => `${group.short} ${time}` === p.group),
          );
          setGroupDay(schedule?.day || "");
          setGroupTime(schedule ? p.group!.slice(3) : "");
          if (p.status === "submitted") {
            setResult(p);
            try {
              localStorage.setItem(resultKey, p.id);
              localStorage.removeItem(storageKey);
            } catch {
              setStorageWarning(true);
            }
          } else if (saved.versionId === a.versionId) {
            setDraft({ ...saved, group: p.group });
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
  useEffect(() => {
    if (result) window.scrollTo(0, 0);
  }, [result?.id]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const p = await rpc<Pick<Draft, "id" | "versionId" | "name" | "group">>(
        "start_attempt",
        { token, name, groupDay, groupTime },
      );
      setDraft({ ...p, answers: {}, position: 0 });
      setValidationAttempted(false);
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
    if (!draft || !checkComplete()) return;
    setConfirm(false);
    setBusy(true);
    setError("");
    try {
      const r = await submitWithRetry(() =>
        rpc<Attempt>("submit_attempt", {
          attemptId: draft.id,
          answers: draft.answers,
        }),
      );
      setResult(r);
      setDraft(null);
      try {
        localStorage.setItem(resultKey, r.id);
        localStorage.removeItem(storageKey);
      } catch {
        setStorageWarning(true);
      }
    } catch (e) {
      setError(submissionErrorText(e));
    } finally {
      setBusy(false);
    }
  }
  const exercise = test?.exercises[draft?.position || 0];
  const sections = exerciseSections(test?.exercises || []);
  const answered =
    draft && test
      ? test.exercises.filter((e) => {
          return answerFilled(e, draft.answers[e.id]);
        }).length
      : 0;
  function choose(value: Answer) {
    if (!draft || !exercise) return;
    setDraft({
      ...draft,
      answers: { ...draft.answers, [exercise.id]: value },
    });
  }
  return (
    <div
      className={`student-page ${ready && !loading && test && !result ? (draft ? "student-page-quiz" : "student-page-intro") : ""}`}
    >
      <header className="student-header">
        <Brand />
        <span className="light-label">
          <Leaf size={16} /> Практика без спешки
        </span>
      </header>
      <main
        // Replace the screen as a whole: browser translators can replace text
        // nodes, making React's quiz-to-result reconciliation fail.
        key={result ? "result" : draft ? "quiz" : "intro"}
        className={`student-main ${result ? "wide" : ""}`}
      >
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
            <div className="result-overview">
              <div className="result-hero">
                <div className="result-status">
                  <span>РАБОТА ЗАВЕРШЕНА</span>
                </div>
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
                    {result.correct} из {result.total}{" "}
                    {result.exercises.some(
                      (e) => e.type === "group" || e.scoring,
                    )
                      ? "баллов набрано"
                      : "упражнений выполнено верно"}
                  </p>
                </div>
                <p
                  className="result-time"
                  aria-label={`Время прохождения: ${formatDuration(result.durationSeconds)}`}
                >
                  <Clock3 size={14} aria-hidden="true" />
                  <span>{formatDuration(result.durationSeconds)}</span>
                </p>
                <p className="helper">
                  Это результат теста, а не экзаменационный балл.
                </p>
                <div className="result-saved" role="status">
                  <Check size={17} aria-hidden="true" />
                  <span>
                    {mode === "demo"
                      ? "Результат сохранён в локальном демонстрационном кабинете."
                      : "Результат сохранён и доступен преподавателю."}
                  </span>
                </div>
              </div>
              <div className="result-actions">
                <Button
                  kind="secondary"
                  onClick={() => {
                    setResult(null);
                  }}
                >
                  <RefreshCw size={17} /> Пройти ещё раз
                </Button>
              </div>
            </div>
            <div className="section-heading">
              <h2>Разбор упражнений</h2>
              <span className="light-label">{testTitle(test)}</span>
            </div>
            <Review exercises={result.exercises} />
          </>
        ) : !draft ? (
          <div className="student-intro">
            <div className="student-intro-heading">
              <div className="student-illustration" aria-hidden="true">
                <GraduationCap size={52} />
              </div>
              <h1>{testTitle(test)}</h1>
              {test.demo && (
                <span className="exam-tag">Демонстрационный тест</span>
              )}
            </div>
            <div className="student-test-facts">
              <span>
                <FileCheck2 size={17} />
                {exerciseCountText(test?.exerciseCount || 0)}
                {test.maximumScore ? ` · ${test.maximumScore} баллов` : ""}
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
                className="student-start-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void start();
                }}
              >
                <label className="field-label student-name-field">
                  <span className="student-form-heading">Твоё имя</span>
                  <input
                    required
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Маша Иванова"
                  />
                </label>
                <fieldset
                  className="student-group-picker"
                  aria-describedby="student-group-description"
                >
                  <legend className="student-form-heading">Твоя группа</legend>
                  <p
                    className="student-group-description"
                    id="student-group-description"
                  >
                    Укажи, когда у тебя обычно проходят занятия. Если
                    занимаешься в разные дни недели, выбери тот, который идёт
                    раньше.
                  </p>
                  <p
                    className="student-group-label"
                    id="student-group-day-label"
                  >
                    День занятий
                  </p>
                  <div
                    className="student-group-days"
                    role="group"
                    aria-labelledby="student-group-day-label"
                    style={
                      {
                        "--student-group-day-count": groups.length,
                        "--student-group-mobile-columns":
                          groups.length === 4 ? 2 : 3,
                      } as CSSProperties
                    }
                  >
                    {groups.map((group) => (
                      <button
                        type="button"
                        className="student-group-choice"
                        key={group.day}
                        aria-label={group.label}
                        aria-pressed={groupDay === group.day}
                        onClick={() => {
                          if (groupDay !== group.day) {
                            setGroupDay(group.day);
                            setGroupTime("");
                          }
                        }}
                      >
                        {group.short}
                      </button>
                    ))}
                  </div>
                  <p
                    className="student-group-label"
                    id="student-group-time-label"
                  >
                    Время начала занятий
                  </p>
                  <div
                    className="student-group-times"
                    role="group"
                    aria-labelledby="student-group-time-label"
                  >
                    {groupDay ? (
                      groups
                        .find((group) => group.day === groupDay)
                        ?.times.map((time) => (
                          <button
                            type="button"
                            className="student-group-choice"
                            key={time}
                            aria-pressed={groupTime === time}
                            onClick={() => setGroupTime(time)}
                          >
                            {time}
                          </button>
                        ))
                    ) : (
                      <button
                        type="button"
                        className="student-group-choice"
                        disabled
                      >
                        Сначала выбери день
                      </button>
                    )}
                  </div>
                </fieldset>
                <ErrorBox message={error} />
                {recoveryFailed && (
                  <Button kind="secondary" onClick={load}>
                    Повторить восстановление
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !name.trim() ||
                    !groupDay ||
                    !groupTime ||
                    recoveryFailed
                  }
                >
                  {busy ? <Loader2 size={18} className="spin" /> : null}Начать
                  тест
                  <ArrowRight size={18} />
                </Button>
              </form>
            )}
          </div>
        ) : (
          <>
            <div className="quiz-heading">
              <div>
                <h2>{testTitle(test)}</h2>
              </div>
              <span className="student-name">{draft.name}</span>
            </div>
            <div className="progress-head">
              <span>
                Выполнено {answered} из {test?.exerciseCount}
              </span>
            </div>
            <div className="progress-track">
              <div
                style={{
                  width: `${(answered / (test?.exerciseCount || 1)) * 100}%`,
                }}
              />
            </div>
            <div
              className={sections.length > 1 ? "question-sections" : undefined}
              aria-label="Упражнения"
            >
              {sections.map((section) => (
                <div className="question-section" key={section.start}>
                  {section.taskNumber && (
                    <div className="question-section-heading">
                      Задание № {section.taskNumber}
                    </div>
                  )}
                  <div
                    className="question-tabs"
                    role="group"
                    aria-label={
                      section.taskNumber
                        ? `Задание № ${section.taskNumber}`
                        : "Номера упражнений"
                    }
                  >
                    {section.exercises.map((e, offset) => {
                      const i = section.start + offset;
                      const a = draft.answers[e.id];
                      const filled = answerFilled(e, a);
                      return (
                        <button
                          aria-label={`Упражнение ${i + 1}${filled ? ", ответ заполнен" : validationAttempted ? ", нет ответа" : ""}`}
                          aria-current={
                            draft.position === i ? "step" : undefined
                          }
                          className={`${draft.position === i ? "current" : ""} ${filled ? "filled" : validationAttempted ? "missing" : ""}`}
                          key={e.id}
                          onClick={() => setDraft({ ...draft, position: i })}
                        >
                          {filled && draft.position !== i ? (
                            <Check size={17} />
                          ) : (
                            <>
                              {i + 1}
                              {validationAttempted && !filled && (
                                <span
                                  className="missing-marker"
                                  aria-hidden="true"
                                >
                                  !
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <section
              className="question-card"
              key={exercise?.id}
              ref={questionRef}
              tabIndex={-1}
              aria-label={`Упражнение ${draft.position + 1}`}
            >
              <div className="eyebrow">
                {exercise?.taskNumber && sections.length > 1
                  ? `ЗАДАНИЕ ${test.exam} № ${exercise.taskNumber} · `
                  : ""}
                УПРАЖНЕНИЕ {draft.position + 1} ИЗ {test?.exerciseCount}
              </div>
              <h1>
                <PromptText
                  text={
                    exercise?.matchingTable
                      ? exercise.prompt.split(/\n\s*\n/)[0]
                      : exercise?.prompt
                  }
                />
              </h1>
              {exercise && <MatchingTable exercise={exercise} />}
              {exercise?.type === "group" ? (
                <>
                  <ReadingPassage exercise={exercise} />
                  {exercise.items?.map((item) => {
                    const saved = draft.answers[exercise.id];
                    const answers =
                      saved &&
                      typeof saved === "object" &&
                      !Array.isArray(saved)
                        ? saved
                        : {};
                    return (
                      <section className="reading-task" key={item.id}>
                        <div className="eyebrow">
                          {item.label || `ЗАДАНИЕ № ${item.taskNumber}`}
                        </div>
                        <h1>
                          <PromptText
                            text={
                              item.matchingTable
                                ? item.prompt.split(/\n\s*\n/)[0]
                                : item.prompt
                            }
                          />
                        </h1>
                        <MatchingTable exercise={item} />
                        <AnswerInput
                          exercise={item}
                          missing={
                            validationAttempted &&
                            !answerFilled(item, answers[item.id])
                          }
                          answer={answers[item.id]}
                          onChange={(value) =>
                            choose({ ...answers, [item.id]: value })
                          }
                        />
                        {validationAttempted &&
                          !answerFilled(item, answers[item.id]) && (
                            <div id={`missing-${item.id}`}>
                              <ErrorBox
                                message={`Ответьте на ${item.label?.toLocaleLowerCase("ru") || `задание № ${item.taskNumber}`}.`}
                              />
                            </div>
                          )}
                      </section>
                    );
                  })}
                </>
              ) : (
                exercise && (
                  <AnswerInput
                    exercise={exercise}
                    missing={
                      validationAttempted &&
                      !answerFilled(exercise, draft.answers[exercise.id])
                    }
                    answer={draft.answers[exercise.id]}
                    onChange={choose}
                  />
                )
              )}
              {validationAttempted &&
                exercise &&
                exercise.type !== "group" &&
                !answerFilled(exercise, draft.answers[exercise.id]) && (
                  <div id={`missing-${exercise.id}`}>
                    <ErrorBox message="Ответьте на это упражнение перед сдачей работы." />
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
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (checkComplete()) setConfirm(true);
                    }}
                  >
                    {busy ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    <span>Завершить и проверить</span>
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
      </main>
      <footer className="student-footer">
        Русский без страданий <span>·</span> маленькая практика, большой
        прогресс
      </footer>
      {showMissing && (
        <Modal title="Нельзя сдать работу" onClose={() => returnToMissing()}>
          <ErrorBox message="Ответьте на все задания. Остались задания без ответа:" />
          <ul className="missing-list">
            {missing.map((item) => (
              <li key={`${item.exerciseId}:${item.itemId || ""}`}>
                <button
                  className="text-button"
                  onClick={() => returnToMissing(item.position)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <Button onClick={() => returnToMissing()}>
            Перейти к первому пропуску <ArrowRight size={17} />
          </Button>
        </Modal>
      )}
      {confirm && (
        <Modal title="Завершить работу?" onClose={() => setConfirm(false)}>
          <p>
            Все упражнения заполнены. После отправки вы увидите результат и
            правильные ответы.
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
