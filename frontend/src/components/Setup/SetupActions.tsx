interface ActiveSteps {
  cam: string;
  mic: string;
  check: string;
  cont: string;
}

interface SetupActionsProps {
  activeSteps: ActiveSteps;
  onEnableCamera: () => void;
  onEnableMicrophone: () => void;
  onRunChecks: () => void;
  onContinue: () => void;
  cameraDisabled: boolean;
  micDisabled: boolean;
  checksDisabled: boolean;
  continueDisabled: boolean;
}

export function SetupActions({
  activeSteps,
  onEnableCamera,
  onEnableMicrophone,
  onRunChecks,
  onContinue,
  cameraDisabled,
  micDisabled,
  checksDisabled,
  continueDisabled,
}: SetupActionsProps) {
  return (
    <div className="actions">
      <button
        className={`btn setup-step-btn ${activeSteps.cam}`}
        onClick={onEnableCamera}
        disabled={cameraDisabled}
      >
        1. Enable Camera
      </button>
      <button
        className={`btn setup-step-btn ${activeSteps.mic}`}
        onClick={onEnableMicrophone}
        disabled={micDisabled}
      >
        2. Enable Microphone
      </button>
      <button
        className={`btn setup-step-btn ${activeSteps.check}`}
        onClick={onRunChecks}
        disabled={checksDisabled}
      >
        3. Run Pre-checks
      </button>
      <button
        className={`btn btn-primary setup-step-btn ${activeSteps.cont}`}
        onClick={onContinue}
        disabled={continueDisabled}
      >
        4. Continue to Face Registration
      </button>
    </div>
  );
}
