import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  getCandidateProfile,
  type CandidateProfile,
} from "../utils/helpers";
import { postJson } from "../api";
import { requestCamera, stopMediaStream } from "../services/mediaService";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";
import { VideoBox } from "../components/common/VideoBox";

interface PoseCheckResponse {
  face_count: number;
  close_enough: boolean;
  sideways_score: number | null;
  center_max: number;
  side_min: number;
}

export function FaceRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const usernameFromQuery = (searchParams.get("username") || "").trim();
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [statusText, setStatusText] = useState("Starting camera...");
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>(["", "", ""]);

  const profile = getCandidateProfile();
  const username = useMemo(() => {
    const localUsername = profile?.username
      ? String(profile.username).trim()
      : "";
    if (
      localUsername &&
      usernameFromQuery &&
      localUsername.toLowerCase() !== usernameFromQuery.toLowerCase()
    ) {
      return usernameFromQuery;
    }
    return localUsername || usernameFromQuery;
  }, [profile, usernameFromQuery]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await requestCamera();
        streamRef.current = stream;
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream;
          await webcamRef.current.play();
        }
        if (!cancelled) {
          setCameraReady(true);
          setStatusText("Camera ready. Click Register and Verify.");
          setStatusError(false);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown camera error";
        if (!cancelled) {
          setStatusText(`Camera error: ${message}`);
          setStatusError(true);
          toast.error(`Camera error: ${message}`);
        }
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  function captureFrame(): string {
    const webcam = webcamRef.current;
    const canvas = canvasRef.current;
    if (!webcam || !canvas || !webcam.videoWidth || !webcam.videoHeight) {
      throw new Error("Camera is not ready");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not access canvas");
    }
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  async function waitForPoseSample(
    stepLabel: string,
    validator: (payload: PoseCheckResponse) => boolean,
    timeoutMs = 12000
  ): Promise<{ image: string; sidewaysScore: number }> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const image = captureFrame();
      const poseData = await postJson<PoseCheckResponse>(
        "/registration_pose_check",
        { image }
      );
      if (poseData.face_count > 1) {
        throw new Error(
          "Multiple faces detected. Only the candidate must be visible during registration."
        );
      }
      if (poseData.face_count === 1 && poseData.close_enough === false) {
        setStatusText(
          "Move closer to camera so your face fills more of the frame."
        );
        setStatusError(false);
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      if (validator(poseData)) {
        return { image, sidewaysScore: Number(poseData.sideways_score || 0) };
      }
      setStatusText(stepLabel);
      setStatusError(false);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    throw new Error(
      `Could not capture ${stepLabel.toLowerCase()}. Try again with better lighting.`
    );
  }

  async function startRegistration() {
    if (!username) {
      setStatusText("Candidate information missing. Return to setup page.");
      setStatusError(true);
      return;
    }
    if (!cameraReady) {
      setStatusText("Enable camera first.");
      setStatusError(true);
      return;
    }

    try {
      setBusy(true);
      setPreviewImages(["", "", ""]);
      setStatusText("Capturing registration samples...");
      setStatusError(false);

      const front = await waitForPoseSample(
        "Step 1/3: Look straight at camera",
        (poseData) =>
          poseData.face_count === 1 &&
          poseData.sideways_score !== null &&
          Math.abs(poseData.sideways_score) <= poseData.center_max
      );
      setPreviewImages((prev) => [front.image, prev[1], prev[2]]);

      const sideOne = await waitForPoseSample(
        "Step 2/3: Turn to one side",
        (poseData) =>
          poseData.face_count === 1 &&
          poseData.sideways_score !== null &&
          Math.abs(poseData.sideways_score) >= poseData.side_min
      );
      setPreviewImages((prev) => [prev[0], sideOne.image, prev[2]]);
      const sideOneSign = sideOne.sidewaysScore >= 0 ? 1 : -1;

      const sideTwo = await waitForPoseSample(
        "Step 3/3: Turn to the opposite side",
        (poseData) =>
          poseData.face_count === 1 &&
          poseData.sideways_score !== null &&
          Math.abs(poseData.sideways_score) >= poseData.side_min &&
          (poseData.sideways_score >= 0 ? 1 : -1) !== sideOneSign
      );
      setPreviewImages((prev) => [prev[0], prev[1], sideTwo.image]);

      await postJson("/register_face", {
        username,
        first_name: String(profile?.first_name || ""),
        last_name: String(profile?.last_name || ""),
        email: String(profile?.email || ""),
        images: [front.image, sideOne.image, sideTwo.image],
      });

      setStatusText("Registration complete. Verifying face...");
      const verifyImage = captureFrame();
      const data = await postJson<{
        ok: boolean;
        match: boolean;
        score: number;
        threshold: number;
      }>("/verify_face", { username, image: verifyImage });
      if (!data.match) {
        setStatusText(
          `Face mismatch. Similarity ${data.score.toFixed(3)} < ${data.threshold}.`
        );
        setStatusError(true);
        return;
      }
      setStatusText(
        `Verification passed (${data.score.toFixed(3)}). Opening proctor setup...`
      );
      setStatusError(false);
      navigate(`/screen_share?username=${encodeURIComponent(username)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatusText(message);
      setStatusError(true);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NavBar>
        <Link className="nav-link" to="/">
          Back
        </Link>
      </NavBar>

      <main className="container">
        <h1>Face Registration</h1>
        <p className="subtitle">
          Capture 3 face samples and verify identity to continue.
        </p>
        <section className="card">
          <p className="subtitle">
            Candidate: <strong>{username || "-"}</strong>
          </p>
          <div className="registration-grid">
            <VideoBox videoRef={webcamRef} canvasRef={canvasRef} />
            <aside className="capture-previews">
              <p className="preview-title">Captured Samples</p>
              <div className="preview-slot">
                <span>Front</span>
                <img src={previewImages[0]} alt="Front sample preview" />
              </div>
              <div className="preview-slot">
                <span>Side 1</span>
                <img src={previewImages[1]} alt="First side sample preview" />
              </div>
              <div className="preview-slot">
                <span>Side 2</span>
                <img src={previewImages[2]} alt="Second side sample preview" />
              </div>
            </aside>
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={startRegistration}
              disabled={!cameraReady || busy}
            >
              Register and Verify
            </button>
          </div>
          <StatusText text={statusText} isError={statusError} />
        </section>
      </main>
    </>
  );
}
