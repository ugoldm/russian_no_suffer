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
  Link2,
  Loader2,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  CircleHelp,
  ChevronRight,
  Clock3,
  AlertCircle,
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
import type {
  Assignment,
  Attempt,
  Draft,
  Exercise,
  Overview,
  Test,
} from "./types";
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const homeworkUrl = (token: string) =>
  `${location.origin}${location.pathname}#/homework/${token}`;
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
  if (route.startsWith("/homework/"))
    return <Student key={route} token={route.split("/")[2]} />;
  return <Teacher />;
}
function Teacher() {
  const [overview, setOverview] = useState<Overview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tab, setTab] = useState("tests"),
    [exam, setExam] = useState("Все"),
    [search, setSearch] = useState(""),
    [groupFilter, setGroupFilter] = useState(""),
    [testFilter, setTestFilter] = useState(""),
    [assignmentFilter, setAssignmentFilter] = useState("");
  const [issueTest, setIssueTest] = useState<Test | null>(null),
    [preview, setPreview] = useState<Test | null>(null),
    [detail, setDetail] = useState<Attempt | null>(null),
    [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [groupModal, setGroupModal] = useState<{
      id?: string;
      name: string;
    } | null>(null);
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
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(homeworkUrl(token));
      setToast("Ссылка скопирована — отправьте её ученикам.");
    } catch {
      setToast("Откройте домашнее задание и скопируйте адрес из браузера.");
    }
  }
  async function closeAssignment(id: string) {
    setBusy(true);
    try {
      await rpc("teacher_close", { assignmentId: id });
      await load();
      setToast("Приём новых попыток завершён.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function showPreview(t: Test) {
    setBusy(true);
    try {
      setPreview(await rpc<Test>("teacher_preview", { testId: t.id }));
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
  if (!overview)
    return <TeacherLogin loading={loading} error={error} onSuccess={load} />;
  const results = overview.results.filter(
    (r) =>
      r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!groupFilter || r.groupName === groupFilter) &&
      (!testFilter || r.testTitle === testFilter) &&
      (!assignmentFilter || r.assignmentId === assignmentFilter),
  );
  const tabs = [
    { id: "tests", label: "Библиотека тестов", icon: BookOpen },
    { id: "assignments", label: "Домашние задания", icon: FileCheck2 },
    { id: "results", label: "Результаты", icon: LayoutGrid },
    { id: "groups", label: "Мои группы", icon: Users },
  ];
  const average = overview.results.length
    ? Math.round(
        overview.results.reduce((s, r) => s + r.percentage, 0) /
          overview.results.length,
      )
    : null;
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
              {id === "results" && overview.results.length > 0 && (
                <span className="nav-count">{overview.results.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-icon">
            <Leaf size={19} />
          </span>
          <h3>
            Маленькие шаги.
            <br />
            Большой прогресс.
          </h3>
          <p>
            Практика по одному номеру —<br />
            больше уверенности на экзамене.
          </p>
        </div>
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
          <span className="topbar-status">
            <span className="status-dot" />
            {mode === "demo"
              ? "Локальная демонстрация"
              : "Общая база подключена"}
          </span>
        </header>
        <main className="main-content">
          <div className="page-intro">
            <div>
              <div className="eyebrow">РУССКИЙ ЯЗЫК · ОГЭ И ЕГЭ</div>
              <h1>
                {tab === "tests" ? (
                  <>
                    Домашние задания,
                    <br />
                    <em>без лишних хлопот.</em>
                  </>
                ) : tab === "assignments" ? (
                  "Всё готово к практике."
                ) : tab === "results" ? (
                  "Прогресс в деталях."
                ) : (
                  "Учиться вместе проще."
                )}
              </h1>
              <p>
                {tab === "tests"
                  ? "Выберите тест, поделитесь ссылкой и посмотрите, как справились ученики."
                  : tab === "assignments"
                    ? "Отдельная ссылка для каждой группы. Все ответы — в одном месте."
                    : tab === "results"
                      ? "Откройте работу, чтобы увидеть ответы ученика и разобрать ошибки."
                      : "Создайте группы, чтобы выдавать задания и находить результаты."}
              </p>
            </div>
            <span className="intro-decoration" aria-hidden="true">
              <GraduationCap size={48} />
              <span className="deco-plus">✦</span>
            </span>
          </div>
          {mode === "demo" && (
            <div className="demo-banner">
              <CircleHelp size={18} />
              <span>
                <strong>Демонстрационная версия.</strong> Данные сохраняются на
                этом компьютере. Для работы учеников с разных устройств
                подключите Supabase.
              </span>
            </div>
          )}
          <ErrorBox message={error} />
          <div className="stats-grid">
            <Stat
              icon={<BookOpen />}
              value={String(overview.tests.length)}
              label="Тест готов к практике"
              color="green"
            />
            <Stat
              icon={<Link2 />}
              value={String(
                overview.assignments.filter((a) => a.active).length,
              )}
              label="Активных домашних заданий"
              color="sand"
            />
            <Stat
              icon={<FileCheck2 />}
              value={String(overview.results.length)}
              label="Работ выполнено"
              color="purple"
            />
            <Stat
              icon={<CheckCircle2 />}
              value={average === null ? "—" : `${average}%`}
              label="Средний результат"
              color="blue"
            />
          </div>
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
                <span className="light-label">
                  <ShieldCheck size={15} /> Проверка после завершения
                </span>
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
                <span className="muted">
                  Первый набор · демонстрационные материалы
                </span>
              </div>
              <div className="test-grid">
                {overview.tests
                  .filter((t) => exam === "Все" || t.exam === exam)
                  .map((t) => (
                    <article key={t.id} className="test-card">
                      <div className="test-card-top">
                        <span className="exam-tag">
                          {t.exam} <span>№ {t.taskNumber}</span>
                        </span>
                        <span className="published">
                          <span className="status-dot" /> Готов к выдаче
                        </span>
                      </div>
                      <div className="test-illustration" aria-hidden="true">
                        <span>А</span>
                        <span className="stress-mark">́</span>
                        <div className="illustration-check">
                          <Check size={17} />
                        </div>
                        <i>а</i>
                        <b>я</b>
                      </div>
                      <div className="test-meta">
                        {t.subtitle.toUpperCase()}
                      </div>
                      <h3>{t.title}</h3>
                      <p>{t.description}</p>
                      <div className="test-facts">
                        <span>
                          <FileCheck2 size={15} />
                          {t.exerciseCount} упражнений
                        </span>
                        <span>
                          <Clock3 size={15} />≈ 5–10 минут
                        </span>
                      </div>
                      <div className="test-card-actions">
                        <Button onClick={() => setIssueTest(t)}>
                          Выдать задание <ArrowUpRight size={17} />
                        </Button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => showPreview(t)}
                        >
                          Посмотреть тест
                        </button>
                      </div>
                    </article>
                  ))}
                {overview.tests.filter((t) => exam === "Все" || t.exam === exam)
                  .length === 0 && (
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
              <div className="how-it-works">
                <h3>От теста до результата — три шага</h3>
                <div>
                  <span>
                    <b>1</b> Выберите тест
                  </span>
                  <ArrowRight size={17} />
                  <span>
                    <b>2</b> Отправьте ссылку группе
                  </span>
                  <ArrowRight size={17} />
                  <span>
                    <b>3</b> Посмотрите ответы
                  </span>
                </div>
              </div>
            </>
          )}
          {tab === "assignments" && (
            <>
              <div className="section-heading">
                <h2>Выданные работы</h2>
                <Button kind="secondary" onClick={() => setTab("tests")}>
                  <Plus size={17} /> Выдать ещё
                </Button>
              </div>
              {overview.assignments.length === 0 ? (
                <Empty
                  icon={<Link2 />}
                  title="Первое домашнее задание ждёт вас"
                  text="Откройте библиотеку, выберите тест и создайте ссылку для учеников."
                  action={
                    <Button onClick={() => setTab("tests")}>
                      Перейти к тестам <ArrowRight size={16} />
                    </Button>
                  }
                />
              ) : (
                <div className="assignments-list">
                  {overview.assignments.map((a) => (
                    <article className="assignment-card" key={a.id}>
                      <div>
                        <span className="exam-tag">
                          {a.test.exam} № {a.test.taskNumber}
                        </span>
                        <h3>{a.title}</h3>
                        <p>
                          {a.groupName} <span>·</span> Выдано{" "}
                          {formatDate(a.createdAt)} <span>·</span>{" "}
                          {a.attemptCount} работ
                        </p>
                        <a
                          className="assignment-link"
                          href={`#/homework/${a.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть как ученик <ArrowUpRight size={14} />
                        </a>
                      </div>
                      <div className="assignment-actions">
                        <span
                          className={`published ${a.active ? "" : "closed"}`}
                        >
                          <span className="status-dot" />
                          {a.active ? "Приём открыт" : "Приём завершён"}
                        </span>
                        <Button kind="secondary" onClick={() => copy(a.token)}>
                          <Copy size={16} /> Скопировать ссылку
                        </Button>
                        {a.active && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => closeAssignment(a.id)}
                          >
                            Завершить приём
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "results" && (
            <>
              <div className="section-heading">
                <h2>
                  Работы учеников{" "}
                  <span className="count-pill">{overview.results.length}</span>
                </h2>
                <Button kind="secondary" onClick={load} disabled={loading}>
                  <RefreshCw size={16} />
                  Обновить
                </Button>
              </div>
              <div className="results-filters">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Поиск по имени ученика"
                    placeholder="Найти ученика по имени"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Фильтр по группе"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                >
                  <option value="">Все группы</option>
                  {Array.from(
                    new Set(overview.results.map((r) => r.groupName)),
                  ).map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по тесту"
                  value={testFilter}
                  onChange={(e) => setTestFilter(e.target.value)}
                >
                  <option value="">Все тесты</option>
                  {Array.from(
                    new Set(overview.results.map((r) => r.testTitle)),
                  ).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по выдаче"
                  value={assignmentFilter}
                  onChange={(e) => setAssignmentFilter(e.target.value)}
                >
                  <option value="">Все выдачи</option>
                  {overview.assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {a.groupName}
                    </option>
                  ))}
                </select>
              </div>
              {results.length === 0 ? (
                <Empty
                  icon={<FileCheck2 />}
                  title={
                    overview.results.length
                      ? "Работы не найдены"
                      : "Результаты появятся здесь"
                  }
                  text={
                    overview.results.length
                      ? "Попробуйте другое имя или группу."
                      : "Как только ученик отправит работу, вы увидите его ответы и результат."
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ученик</th>
                        <th>Тест и группа</th>
                        <th>Результат</th>
                        <th>Отправлено</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                            <small>Попытка {r.attemptNumber}</small>
                          </td>
                          <td>
                            {r.testTitle}
                            <small>
                              {r.groupName} · {r.exam} № {r.taskNumber}
                            </small>
                          </td>
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
                          <td>{formatDate(r.submittedAt)}</td>
                          <td>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => showResult(r)}
                            >
                              Открыть <ChevronRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {tab === "groups" && (
            <>
              <div className="section-heading">
                <h2>Учебные группы</h2>
                <Button onClick={() => setGroupModal({ name: "" })}>
                  <Plus size={17} /> Добавить группу
                </Button>
              </div>
              {overview.groups.length === 0 ? (
                <Empty
                  icon={<Users />}
                  title="Добавьте свою первую группу"
                  text="Например, «ЕГЭ · вторник» или «ОГЭ · 9 класс». Списки учеников заранее не нужны."
                />
              ) : (
                <div className="group-grid">
                  {overview.groups.map((g) => (
                    <article className="group-card" key={g.id}>
                      <span className="group-icon">
                        <Users size={23} />
                      </span>
                      <h3>{g.name}</h3>
                      <p>
                        {g.archived
                          ? "В архиве"
                          : `${overview.assignments.filter((a) => a.groupId === g.id && a.active).length} активных заданий`}
                      </p>
                      <button
                        className="text-button"
                        onClick={() =>
                          setGroupModal({ id: g.id, name: g.name })
                        }
                      >
                        Переименовать
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await rpc("teacher_group", {
                              id: g.id,
                              archived: !g.archived,
                            });
                            await load();
                          } catch (e) {
                            setError(errorText(e));
                          }
                        }}
                      >
                        {g.archived ? "Вернуть из архива" : "В архив"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Русский без страданий</span>
            <span>Больше практики. Меньше рутины.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {issueTest && (
        <IssueModal
          test={issueTest}
          groups={overview.groups.filter((g) => !g.archived)}
          onClose={() => setIssueTest(null)}
          onIssued={async () => {
            await load();
          }}
        />
      )}
      {preview && (
        <Modal title="Предпросмотр теста" onClose={() => setPreview(null)}>
          <p className="muted">
            {preview.exam} № {preview.taskNumber} · версия {preview.version} ·{" "}
            {preview.source}
          </p>
          <h3>{preview.title}</h3>
          <Review exercises={preview.exercises} preview />
        </Modal>
      )}
      {detail && (
        <Modal title={`Работа: ${detail.name}`} onClose={() => setDetail(null)}>
          <div className="detail-meta">
            <span>
              {detail.groupName} · {detail.testTitle}
            </span>
            <strong>
              {detail.correct} из {detail.total} · {detail.percentage}%
            </strong>
          </div>
          <Review exercises={detail.exercises} />
        </Modal>
      )}
      {groupModal && (
        <GroupModal
          group={groupModal}
          onClose={() => setGroupModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
function Stat({
  icon,
  value,
  label,
  color,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${color}`}>{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
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
        <p>
          Тесты по номерам, домашние задания по ссылке и ответы каждого ученика.
        </p>
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
          Ученикам вход в кабинет не нужен — только ссылка на задание.
        </span>
      </main>
      <footer>Русский без страданий · учиться можно спокойно</footer>
    </div>
  );
}
function GroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: { id?: string; name: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={group.id ? "Название группы" : "Новая группа"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await rpc("teacher_group", { ...group, name });
            await onSaved();
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          Название
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ЕГЭ · вторник"
          />
        </label>
        <ErrorBox message={error} />
        <Button type="submit" disabled={busy}>
          Сохранить группу
        </Button>
      </form>
    </Modal>
  );
}
function IssueModal({
  test,
  groups,
  onClose,
  onIssued,
}: {
  test: Test;
  groups: { id: string; name: string }[];
  onClose: () => void;
  onIssued: () => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(""),
    [title, setTitle] = useState(test.title),
    [assignment, setAssignment] = useState<Assignment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  return (
    <Modal
      title={
        assignment ? "Задание готово к отправке" : "Выдать домашнее задание"
      }
      onClose={onClose}
    >
      {assignment ? (
        <>
          <div className="success-mark">
            <Check size={28} />
          </div>
          <p>Отправьте ссылку ученикам. Им понадобится только имя.</p>
          <label className="field-label">
            Ссылка на работу
            <input
              readOnly
              value={homeworkUrl(assignment.token)}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="button-row">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    homeworkUrl(assignment.token),
                  );
                  setCopied(true);
                } catch {
                  setError("Выделите и скопируйте ссылку из поля выше.");
                }
              }}
            >
              <Copy size={16} />
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
            <a
              className="button secondary"
              href={`#/homework/${assignment.token}`}
              target="_blank"
              rel="noreferrer"
            >
              Открыть тест <ArrowUpRight size={17} />
            </a>
          </div>
          {mode === "demo" && (
            <p className="helper">
              Локальная ссылка работает только на этом компьютере. Для отправки
              реальным ученикам сначала подключите Supabase и опубликуйте сайт.
            </p>
          )}
          <ErrorBox message={error} />
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const a = await rpc<Assignment>("teacher_issue", {
                testId: test.id,
                groupId: groupId || null,
                title,
              });
              setAssignment(a);
              await onIssued();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="exam-tag">
            {test.exam} № {test.taskNumber} · {test.exerciseCount} упражнений
          </span>
          <label className="field-label">
            Название домашнего задания
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field-label">
            Для какой группы
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Без группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <p className="helper">
            Версия теста фиксируется при выдаче. Обновления материалов не
            изменят эту работу.
          </p>
          <ErrorBox message={error} />
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Link2 size={17} />
            )}
            Создать ссылку
          </Button>
        </form>
      )}
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
          className={`review-item ${preview ? "" : e.correct ? "correct" : "incorrect"}`}
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
          <h4>{e.prompt}</h4>
          {preview && (
            <div className="preview-options">
              {e.options?.map((o) => (
                <span key={o.id}>
                  {o.id}. {o.text}
                </span>
              ))}
            </div>
          )}
          {!preview && (
            <p>
              <span className="muted">Ответ ученика:</span>{" "}
              {readableAnswer(e, e.rawAnswer)}
            </p>
          )}
          <p>
            <span className="muted">Правильный ответ:</span>{" "}
            <strong>{readableAnswer(e, e.correctAnswer || e.key)}</strong>
          </p>
          <div className="explanation">{e.explanation}</div>
        </article>
      ))}
    </div>
  );
}
function Student({ token }: { token: string }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null),
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
      const a = await rpc<Assignment>("get_assignment", {
        token,
        captchaToken: captcha,
      });
      setAssignment(a);
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
  const test = assignment?.test,
    exercise = test?.exercises[draft?.position || 0];
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
            <div className="eyebrow">ДОМАШНЕЕ ЗАДАНИЕ</div>
            <h1>Сначала маленькая проверка</h1>
            <p>Подтвердите, что вы человек, чтобы открыть задание.</p>
            <Captcha onToken={onCaptcha} />
          </div>
        ) : loading ? (
          <div className="loading">
            <Loader2 className="spin" /> Открываем задание…
          </div>
        ) : !assignment ? (
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
                    : "Каждая попытка — шаг вперёд."}
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
              <div className="result-saved">
                <Check size={17} />
                {mode === "demo"
                  ? "Результат сохранён в локальном демонстрационном кабинете."
                  : "Результат сохранён и доступен преподавателю."}
              </div>
              <p className="helper">
                Это результат домашнего задания, а не экзаменационный балл.
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
            <h1>{assignment.title}</h1>
            <p className="intro-description">{test?.description}</p>
            <div className="student-test-facts">
              <span>
                <FileCheck2 size={17} />
                {test?.exerciseCount} упражнений
              </span>
              <span>
                <Clock3 size={17} />≈ 5–10 минут
              </span>
              <span>
                <Users size={17} />
                {assignment.groupName}
              </span>
            </div>
            {!assignment.active ? (
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
                <h2>{assignment.title}</h2>
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
              <h1>{exercise?.prompt}</h1>
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
        {assignment && !draft && (
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
                  setAssignment(null);
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
