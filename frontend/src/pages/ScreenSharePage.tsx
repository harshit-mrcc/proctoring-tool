import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";
import { requestScreenShare, stopMediaStream } from "../services/mediaService";

export function ScreenSharePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const username = (searchParams.get("username") || "").trim();
  const [statusText, setStatusText] = useState("Waiting to start setup...");
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Fullscreen toggle failed";
      toast.error(`Fullscreen error: ${message}`);
    }
  }

  async function beginSetup() {
    try {
      setBusy(true);
      setStatusText("Requesting screen share...");
      setStatusError(false);
      const displayStream = await requestScreenShare();
      const videoTrack = displayStream.getVideoTracks()[0];
      const displaySurface = videoTrack
        ? String(videoTrack.getSettings().displaySurface || "")
        : "";
      if (displaySurface !== "monitor") {
        stopMediaStream(displayStream);
        setBusy(false);
        const warning =
          "Share your entire screen only. Window/tab share is not accepted.";
        setStatusText(warning);
        setStatusError(true);
        toast.warning(warning);
        return;
      }
      stopMediaStream(displayStream);

      setStatusText("Setup complete. Opening exam in a new tab...");
      const examUrl = `/exam?username=${encodeURIComponent(username)}&proctor=1`;
      const examTab = window.open(examUrl, "_blank");
      if (!examTab) {
        setStatusText("Popup blocked. Opening exam in current tab...");
        setStatusError(true);
        toast.warning(
          "Popup blocked. Allow popups for this site. Exam rules still apply."
        );
        navigate(examUrl);
        return;
      }
      toast.info(
        "Exam opened in a separate tab. Switching tabs or losing focus may cancel your exam."
      );
      setStatusText("Exam opened in a new tab. Continue there now.");
      setStatusError(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown setup error";
      setStatusText(`Setup failed: ${message}`);
      setStatusError(true);
      toast.error(`Setup failed: ${message}`);
      setBusy(false);
    }
  }

  return (
    <>
      <NavBar>
        <Link className="nav-link" to="/">
          Home
        </Link>
      </NavBar>
      <main className="container">
        <section className="card setup-card">
          <h1>Final Proctor Setup</h1>
          <p className="subtitle">
            Candidate: <strong>{username || "-"}</strong>
          </p>
          <p className="gate-note">
            Share your entire screen. Screen content is not recorded.
          </p>
          <div className="actions" style={{ gap: "10px" }}>
            <button
              className={`btn ${isFullscreen ? "btn-primary" : ""}`}
              onClick={toggleFullscreen}
              disabled={busy}
            >
              {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            </button>
            <button
              className="btn btn-primary"
              onClick={beginSetup}
              disabled={busy}
            >
              Enable and Continue
            </button>
          </div>
          <StatusText text={statusText} isError={statusError} />
        </section>
      </main>
    </>
  );
}
