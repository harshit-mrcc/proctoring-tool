import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { formatTime } from "../utils/helpers";
import { requestCamera, stopMediaStream } from "../services/mediaService";
import { NavBar } from "../components/common/NavBar";

type ViolationCounters = Record<string, number>;
const BASE_VIOLATIONS: ViolationCounters = {
  no_face: 0,
  multiple_faces: 0,
  looking_sideways: 0,
  identity_mismatch: 0,
  low_lighting: 0,
  phone_visible: 0,
  tab_hidden: 0,
  window_blur: 0,
  fullscreen_exit: 0,
  navigation_attempt: 0,
  reload_or_close_attempt: 0,
  monitor_error: 0,
};

const QUESTIONS = [
  {
    text: "Which data structure uses FIFO order?",
    options: ["Stack", "Queue", "Tree"],
  },
  {
    text: "What is the output of 2 ** 3 in Python?",
    options: ["5", "6", "8"],
  },
  { text: "HTTP status code for success is:", options: ["200", "404", "500"] },
  {
    text: "Which keyword defines a function in Python?",
    options: ["func", "define", "def"],
  },
  {
    text: "Which protocol is used for secure web traffic?",
    options: ["HTTP", "HTTPS", "FTP"],
  },
  {
    text: "Which one is a mutable Python type?",
    options: ["tuple", "list", "str"],
  },
  {
    text: "What does CSS stand for?",
    options: [
      "Cascading Style Sheets",
      "Creative Style Syntax",
      "Computer Style System",
    ],
  },
  {
    text: "Which SQL command retrieves data?",
    options: ["INSERT", "UPDATE", "SELECT"],
  },
  {
    text: "Which complexity is better for sorting large data?",
    options: ["O(n log n)", "O(n^2)", "O(2^n)"],
  },
  {
    text: "Which command creates a virtual environment in Python?",
    options: [
      "python -m venv .venv",
      "pip install venv",
      "python create venv",
    ],
  },
];

export function ExamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examUsername = (searchParams.get("username") || "").trim();
  const fromSetup = searchParams.get("proctor") === "1";
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const monitorRef = useRef<number | null>(null);
  const recentViolationAtRef = useRef<Record<string, number>>({});
  const [examEnded, setExamEnded] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(
    new Array(10).fill(null)
  );
  const [markedForLater, setMarkedForLater] = useState<boolean[]>(
    new Array(10).fill(false)
  );
  const [violations, setViolations] = useState<ViolationCounters>({
    ...BASE_VIOLATIONS,
  });
  const [report, setReport] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fullscreenLocked, setFullscreenLocked] = useState(true);

  const questions = useMemo(() => QUESTIONS, []);
  const totalViolationCount = useMemo(
    () => Object.values(violations).reduce((sum, count) => sum + count, 0),
    [violations]
  );
  const attemptedCount = answers.filter((item) => item !== null).length;
  const unansweredCount = questions.length - attemptedCount;
  const markedCount = markedForLater.filter(Boolean).length;

  function addReportEntry(text: string) {
    setReport((prev) => [text, ...prev].slice(0, 60));
  }

  function raiseClientViolation(
    type: string,
    note: string,
    cooldownMs = 3000
  ) {
    if (examEnded) return;
    const nowTs = Date.now();
    const lastTs = recentViolationAtRef.current[type] || 0;
    if (nowTs - lastTs < cooldownMs) return;
    recentViolationAtRef.current[type] = nowTs;
    setViolations((prev) => ({ ...prev, [type]: Number(prev[type] || 0) + 1 }));
    const now = new Date().toLocaleTimeString();
    addReportEntry(note ? `[${now}] ${type}: ${note}` : `[${now}] ${type}`);
    if (type === "fullscreen_exit") {
      toast.warning(
        "Fullscreen was exited. Re-enter fullscreen immediately to continue."
      );
    }
  }

  function getQuestionState(
    index: number
  ): "unanswered" | "attempted" | "marked" {
    if (markedForLater[index]) return "marked";
    if (answers[index] !== null) return "attempted";
    return "unanswered";
  }

  async function enforceFullscreenBeforeExam(): Promise<boolean> {
    if (document.fullscreenElement) {
      setFullscreenLocked(false);
      return true;
    }
    try {
      await document.documentElement.requestFullscreen();
      setFullscreenLocked(false);
      return true;
    } catch {
      setFullscreenLocked(true);
      return false;
    }
  }

  function endExam() {
    if (examEnded) return;
    setExamEnded(true);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (monitorRef.current) {
      window.clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const answered = answers.filter((item) => item !== null).length;
    const unanswered = questions.length - answered;
    navigate(
      `/thank_you?username=${encodeURIComponent(examUsername)}&answered=${answered}&unanswered=${unanswered}&violations=${totalViolationCount}`
    );
  }

  async function analyzeFrame() {
    if (
      examEnded ||
      !webcamRef.current ||
      !canvasRef.current
    )
      return;
    const webcam = webcamRef.current;
    const canvas = canvasRef.current;
    if (!webcam.videoWidth || !webcam.videoHeight) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.75);
    const response = await fetch("/analyze_frame", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, username: examUsername }),
    });
    if (!response.ok) {
      throw new Error("Frame analysis failed");
    }
    const data = (await response.json()) as { violations?: string[] };
    const responseViolations = Array.isArray(data.violations)
      ? data.violations
      : [];
    if (responseViolations.length > 0) {
      const now = new Date().toLocaleTimeString();
      setViolations((prev) => {
        const next = { ...prev };
        responseViolations.forEach((item) => {
          next[item] = Number(next[item] || 0) + 1;
        });
        return next;
      });
      responseViolations.forEach((item) => addReportEntry(`[${now}] ${item}`));
    }
  }

  useEffect(() => {
    const onPopState = () => {
      history.pushState(null, "", window.location.href);
      raiseClientViolation("navigation_attempt", "Back navigation blocked");
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (examEnded) return;
      event.preventDefault();
      event.returnValue = "";
      raiseClientViolation(
        "reload_or_close_attempt",
        "Tried to reload or close tab"
      );
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        raiseClientViolation(
          "tab_hidden",
          "Tab hidden/switched. This action can cancel your exam."
        );
      }
    };
    const onBlur = () => {
      raiseClientViolation(
        "window_blur",
        "Window lost focus, possibly due to tab/app switch or notification interaction."
      );
    };
    const onFullscreenChange = () => {
      if (examEnded) return;
      if (document.fullscreenElement) {
        setFullscreenLocked(false);
      } else {
        setFullscreenLocked(true);
        raiseClientViolation(
          "fullscreen_exit",
          "Fullscreen exited. This can cancel your exam."
        );
        window.setTimeout(() => {
          if (!examEnded) {
            void enforceFullscreenBeforeExam();
          }
        }, 120);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (examEnded) return;
      const isReload =
        event.key === "F5" || (event.ctrlKey && event.key.toLowerCase() === "r");
      const isCloseTab =
        event.ctrlKey && event.key.toLowerCase() === "w";
      const isBackNav = event.altKey && event.key === "ArrowLeft";
      if (isReload || isCloseTab || isBackNav) {
        event.preventDefault();
        raiseClientViolation("navigation_attempt", "Keyboard navigation blocked");
      }
    };

    async function run() {
      if (!fromSetup) {
        addReportEntry(
          `[${new Date().toLocaleTimeString()}] setup_warning: exam not opened from setup flow`
        );
      }
      const fullscreenReady = await enforceFullscreenBeforeExam();
      if (!fullscreenReady) return;

      const stream = await requestCamera();
      streamRef.current = stream;
      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
        webcamRef.current.onloadedmetadata = () => {
          webcamRef.current?.play().catch((error: unknown) => {
            const msg =
              error instanceof Error ? error.message : "Unknown play error";
            raiseClientViolation("monitor_error", `Video play failed: ${msg}`, 2000);
            toast.error(`Video play failed: ${msg}`);
          });
        };
      }

      timerRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            window.setTimeout(() => endExam(), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      monitorRef.current = window.setInterval(() => {
        void analyzeFrame().catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Unknown monitor error";
          raiseClientViolation("monitor_error", message, 2000);
          toast.error(`Monitor error: ${message}`);
        });
      }, 1000);
    }

    history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);

    void run().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unknown startup error";
      raiseClientViolation("monitor_error", message, 0);
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (monitorRef.current) window.clearInterval(monitorRef.current);
      stopMediaStream(streamRef.current);
    };
  }, []);

  function guardedNavigate(event: React.MouseEvent) {
    if (examEnded) return;
    event.preventDefault();
    raiseClientViolation("navigation_attempt", "Header navigation blocked");
  }

  const currentQuestion = questions[currentQuestionIndex];
  const selectedOption = answers[currentQuestionIndex];

  return (
    <>
      <NavBar>
        <a
          className="nav-link"
          href="/"
          onClick={guardedNavigate}
        >
          Home
        </a>
      </NavBar>

      <main className="container exam-layout">
        <section className="exam-content">
          <h1>Online Exam</h1>
          <p className="subtitle">
            Candidate: <strong>{examUsername || "-"}</strong>
          </p>
          <form className="questions-card">
            <div className="exam-head-row">
              <h2>Sample Questions</h2>
              <div className="exam-timer">
                {formatTime(Math.max(remainingSeconds, 0))}
              </div>
            </div>
            <p className="question-step">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
            <div className="question">
              <p>
                {currentQuestionIndex + 1}. {currentQuestion.text}
              </p>
              {currentQuestion.options.map((option, optionIndex) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="active_question"
                    value={optionIndex}
                    checked={selectedOption === optionIndex}
                    onChange={() => {
                      if (examEnded || fullscreenLocked) return;
                      setAnswers((prev) => {
                        const next = [...prev];
                        next[currentQuestionIndex] = optionIndex;
                        return next;
                      });
                    }}
                    disabled={examEnded || fullscreenLocked}
                  />{" "}
                  {option}
                </label>
              ))}
            </div>

            <div className="question-nav">
              <button
                type="button"
                className="btn"
                disabled={
                  examEnded || fullscreenLocked || currentQuestionIndex === 0
                }
                onClick={() =>
                  setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0))
                }
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-mark"
                disabled={examEnded || fullscreenLocked}
                onClick={() => {
                  setMarkedForLater((prev) => {
                    const next = [...prev];
                    next[currentQuestionIndex] = !next[currentQuestionIndex];
                    return next;
                  });
                }}
              >
                {markedForLater[currentQuestionIndex]
                  ? "Unmark Later"
                  : "Mark for Later"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  examEnded ||
                  fullscreenLocked ||
                  currentQuestionIndex === questions.length - 1
                }
                onClick={() =>
                  setCurrentQuestionIndex((prev) =>
                    Math.min(prev + 1, questions.length - 1)
                  )
                }
              >
                Next
              </button>
            </div>

            <button
              type="button"
              className="btn btn-danger exam-end-btn"
              disabled={examEnded || fullscreenLocked}
              onClick={endExam}
            >
              End Exam
            </button>
          </form>
        </section>

        <aside className="question-stats-widget" aria-label="Question Stats">
          <strong>Progress</strong>
          <div className="stats-line">
            <span>Attempted</span>
            <span className="stats-value attempted">{attemptedCount}</span>
          </div>
          <div className="stats-line">
            <span>Unanswered</span>
            <span className="stats-value unanswered">{unansweredCount}</span>
          </div>
          <div className="stats-line">
            <span>Marked</span>
            <span className="stats-value marked">{markedCount}</span>
          </div>
          <p className="palette-note">Question Palette</p>
          <div className="question-palette" aria-label="Question Navigation">
            {questions.map((_, index) => {
              const state = getQuestionState(index);
              return (
                <button
                  key={index}
                  type="button"
                  className={`palette-item ${state}${
                    index === currentQuestionIndex ? " current" : ""
                  }`}
                  onClick={() => setCurrentQuestionIndex(index)}
                  disabled={examEnded || fullscreenLocked}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="monitor-widget" aria-label="Live Monitoring">
          <video ref={webcamRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} width={640} height={480} hidden />
          <button
            className={`violations-toggle ${
              totalViolationCount > 0 ? "has-violation" : ""
            }`}
            onClick={() => setPanelOpen((prev) => !prev)}
          >
            Violations ({totalViolationCount})
          </button>

          <div className={`violations-panel ${panelOpen ? "" : "hidden"}`}>
            <div className="violations-head">
              <strong>Live Violations</strong>
              <span
                className={`violation-status ${
                  totalViolationCount > 0 ? "alert" : ""
                }`}
              >
                {totalViolationCount > 0 ? "Attention" : "Normal"}
              </span>
            </div>
            <div className="totals">
              {Object.entries(violations).map(([name, count]) => (
                <span key={name} className="total-chip">
                  {name}: {count}
                </span>
              ))}
            </div>
            <ul id="reportList">
              {report.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
