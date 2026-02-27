import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useBodyClass } from "../hooks/useBodyClass";
import {
  type SetupChecks,
  saveCandidateProfile,
  getCandidateProfile,
  detectMobileClientSide,
  isValidName,
  type CandidateProfile,
} from "../utils/helpers";
import { fetchSetupConfig, fetchDeviceCheck } from "../api";
import {
  requestCamera,
  requestMicrophone,
  stopMediaStream,
  estimateLightingScore,
  measureInternetSpeedMbps,
  testMicrophone,
} from "../services/mediaService";
import { CandidateForm } from "../components/Setup/CandidateForm";
import { CheckList } from "../components/Setup/CheckList";
import { SetupActions } from "../components/Setup/SetupActions";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";
import { VideoBox } from "../components/common/VideoBox";
import { Link } from "react-router-dom";

export function SetupPage() {
  useBodyClass("registration-page");
  const navigate = useNavigate();
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [statusText, setStatusText] = useState("Waiting for camera...");
  const [statusError, setStatusError] = useState(false);
  const [nextStepText, setNextStepText] = useState(
    'Click "1. Enable Camera" to start.'
  );

  const [cameraReady, setCameraReady] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [mobileBlocked, setMobileBlocked] = useState(false);
  const [minDownloadMbps, setMinDownloadMbps] = useState(2.0);
  const [checks, setChecks] = useState<SetupChecks>({
    device: true,
    internet: null,
    mic: null,
    lighting: null,
  });
  const [busyCamera, setBusyCamera] = useState(false);
  const [busyMic, setBusyMic] = useState(false);
  const [busyChecks, setBusyChecks] = useState(false);

  useEffect(() => {
    const profile = getCandidateProfile();
    if (profile) {
      setFirstName(String(profile.first_name || ""));
      setLastName(String(profile.last_name || ""));
      setEmail(String(profile.email || ""));
    }

    const detectedMobile = detectMobileClientSide();
    setMobileBlocked(detectedMobile);
    setChecks((prev) => ({ ...prev, device: !detectedMobile }));

    fetchSetupConfig()
      .then((data) => {
        setMinDownloadMbps(Number(data.min_download_mbps || 2.0));
        if (data.mobile_detected) {
          setMobileBlocked(true);
          setChecks((prev) => ({ ...prev, device: false }));
        }
      })
      .catch(() => {
        // no-op
      });

    fetchDeviceCheck()
      .then((data) => {
        if (!data.supported) {
          setMobileBlocked(true);
          setChecks((prev) => ({ ...prev, device: false }));
        }
      })
      .catch(() => {
        // no-op
      });

    return () => {
      stopMediaStream(cameraStreamRef.current);
    };
  }, []);

  useEffect(() => {
    const profile: CandidateProfile = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      username: `${firstName.trim().replace(/\s+/g, " ")} ${lastName
        .trim()
        .replace(/\s+/g, " ")}`.trim(),
      updated_at: new Date().toISOString(),
    };
    saveCandidateProfile(profile);
  }, [firstName, lastName, email]);

  const allChecksPass =
    checks.device === true &&
    checks.internet === true &&
    checks.mic === true &&
    checks.lighting === true;
  const hasRequiredDetails =
    firstName.trim().length > 0 && lastName.trim().length > 0;
  const continueDisabled =
    !cameraReady || !allChecksPass || !hasRequiredDetails || mobileBlocked;
  const enableMicDisabled = !cameraReady || mobileBlocked || busyMic;
  const runChecksDisabled =
    !cameraReady || !micPermissionGranted || mobileBlocked || busyChecks;
  const enableCameraDisabled = busyCamera || mobileBlocked || cameraReady;

  useEffect(() => {
    if (mobileBlocked) {
      setStatusText(
        "Mobile devices are not supported. Please use a desktop/laptop browser."
      );
      setStatusError(true);
      setNextStepText("Switch to desktop/laptop and reload setup.");
      return;
    }
    if (!cameraReady) {
      setNextStepText('Click "1. Enable Camera" and allow camera permission.');
      return;
    }
    if (!micPermissionGranted) {
      setNextStepText('Click "2. Enable Microphone" and allow permission.');
      return;
    }
    if (!allChecksPass) {
      setNextStepText(
        'Click "3. Run Pre-checks". If anything fails, fix it and run again.'
      );
      return;
    }
    if (!hasRequiredDetails) {
      setNextStepText("Enter first and last name to continue.");
      return;
    }
    setNextStepText('All good. Click "4. Continue to Face Registration".');
  }, [mobileBlocked, cameraReady, micPermissionGranted, allChecksPass, hasRequiredDetails]);

  function setStatus(message: string, isError = false) {
    setStatusText(message);
    setStatusError(isError);
  }

  async function enableCamera() {
    if (mobileBlocked || cameraReady) return;
    try {
      setBusyCamera(true);
      const stream = await requestCamera();
      cameraStreamRef.current = stream;
      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
        await webcamRef.current.play();
      }
      setCameraReady(true);
      setStatus("Camera ready. Run pre-checks next.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown camera error";
      setStatus(`Camera error: ${message}`, true);
      toast.error(`Camera error: ${message}`);
    } finally {
      setBusyCamera(false);
    }
  }

  async function enableMicrophone() {
    if (mobileBlocked) return;
    try {
      setBusyMic(true);
      setStatus("Requesting microphone permission...");
      const stream = await requestMicrophone();
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionGranted(true);
      setChecks((prev) => ({ ...prev, mic: null }));
      setStatus("Microphone permission granted. You can run pre-checks now.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown microphone error";
      setMicPermissionGranted(false);
      setChecks((prev) => ({ ...prev, mic: false }));
      setStatus(`Microphone permission failed: ${message}`, true);
      toast.error(`Microphone permission failed: ${message}`);
    } finally {
      setBusyMic(false);
    }
  }

  async function runPrechecks() {
    if (!cameraReady) {
      setStatus("Enable camera first.", true);
      return;
    }
    if (!micPermissionGranted) {
      setStatus("Enable microphone first.", true);
      toast.info(
        'Click "Enable Microphone" and allow permission in your browser.'
      );
      return;
    }
    try {
      setBusyChecks(true);
      setStatus("Running internet, microphone, and lighting checks...");
      const speed = await measureInternetSpeedMbps();
      const internetOk = speed >= minDownloadMbps;
      
      const micStream = await requestMicrophone();
      const micOk = await testMicrophone(micStream);
      
      const lightOk = estimateLightingScore(webcamRef.current!, canvasRef.current!) >= 60;
      
      if (!internetOk)
        toast.warning(
          `Internet speed too low (${speed.toFixed(2)} Mbps). Minimum required is ${minDownloadMbps} Mbps.`
        );
      if (!micOk)
        toast.warning(
          "Microphone test failed. Ensure mic permission is granted and audio is detectable."
        );
      if (!lightOk)
        toast.warning(
          "Lighting is too dim. Increase room light and keep face clearly visible."
        );
      
      setChecks((prev) => ({
        ...prev,
        internet: internetOk,
        mic: micOk,
        lighting: lightOk,
      }));
      
      if (internetOk && micOk && lightOk) {
        setStatus("All checks passed. Continue to face registration.");
      } else {
        setStatus(
          "Some checks failed. Resolve highlighted issues and run checks again.",
          true
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown pre-check error";
      setStatus(`Pre-check error: ${message}`, true);
      toast.error(`Pre-check error: ${message}`);
    } finally {
      setBusyChecks(false);
    }
  }

  function goToFaceRegistration() {
    if (!allChecksPass) {
      setStatus("Run and pass all pre-checks before continuing.", true);
      return;
    }
    if (!hasRequiredDetails) {
      setStatus("Enter first name and last name.", true);
      return;
    }
    if (!isValidName(firstName) || !isValidName(lastName)) {
      setStatus("Use alphabetic first/last names only.", true);
      return;
    }
    const username = `${firstName.trim().replace(/\s+/g, " ")} ${lastName
      .trim()
      .replace(/\s+/g, " ")}`.trim();
    navigate(`/face_register?username=${encodeURIComponent(username)}`);
  }

  const activeStepClass = (() => {
    if (mobileBlocked)
      return { cam: "", mic: "", check: "", cont: "" };
    if (!cameraReady)
      return { cam: "active-step", mic: "", check: "", cont: "" };
    if (!micPermissionGranted)
      return { cam: "", mic: "active-step", check: "", cont: "" };
    if (!allChecksPass)
      return { cam: "", mic: "", check: "active-step", cont: "" };
    return { cam: "", mic: "", check: "", cont: "active-step" };
  })();

  return (
    <>
      <NavBar>
        <div className="nav-actions">
          <Link className="nav-link" to="/">
            Setup
          </Link>
          <Link className="nav-link" to="/admin/login">
            Admin Login
          </Link>
        </div>
      </NavBar>

      <main className="container">
        <h1>Exam Pre-check</h1>
        <p className="subtitle">
          Enter basic details and complete checks before face registration.
        </p>
        <section className="card setup-instructions">
          <h2>Instructions</h2>
          <ul>
            <li>Use desktop/laptop only. Mobile devices are blocked.</li>
            <li>Keep your face visible with good room lighting.</li>
            <li>
              Use stable internet with minimum {minDownloadMbps} Mbps download
              speed.
            </li>
            <li>Allow camera and microphone permissions.</li>
          </ul>
        </section>

        <section className="card">
          <CandidateForm
            firstName={firstName}
            lastName={lastName}
            email={email}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onEmailChange={setEmail}
          />

          <VideoBox videoRef={webcamRef} canvasRef={canvasRef} />

          <CheckList
            deviceOk={!mobileBlocked && checks.device}
            internetOk={checks.internet}
            micOk={checks.mic}
            lightingOk={checks.lighting}
          />

          <SetupActions
            activeSteps={activeStepClass}
            onEnableCamera={enableCamera}
            onEnableMicrophone={enableMicrophone}
            onRunChecks={runPrechecks}
            onContinue={goToFaceRegistration}
            cameraDisabled={enableCameraDisabled}
            micDisabled={enableMicDisabled}
            checksDisabled={runChecksDisabled}
            continueDisabled={continueDisabled}
          />

          <div className="next-step-box">
            <strong>Next Step</strong>
            <p>{nextStepText}</p>
          </div>
          <StatusText text={statusText} isError={statusError} />
        </section>
      </main>
    </>
  );
}
