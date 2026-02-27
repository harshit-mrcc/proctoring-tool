import { type CheckStatus } from "../../utils/helpers";

interface CheckListProps {
  deviceOk: CheckStatus;
  internetOk: CheckStatus;
  micOk: CheckStatus;
  lightingOk: CheckStatus;
}

function checkClassName(ok: CheckStatus): string {
  if (ok === null) return "check-pill pending";
  return ok ? "check-pill pass" : "check-pill fail";
}

function checkText(ok: CheckStatus): string {
  if (ok === null) return "Pending";
  return ok ? "Pass" : "Fail";
}

export function CheckList({
  deviceOk,
  internetOk,
  micOk,
  lightingOk,
}: CheckListProps) {
  return (
    <div className="checklist-card">
      <p className="preview-title">System Checks</p>
      <div className="check-row">
        <span>Desktop/Laptop device</span>
        <strong className={checkClassName(deviceOk)}>{checkText(deviceOk)}</strong>
      </div>
      <div className="check-row">
        <span>Internet speed</span>
        <strong className={checkClassName(internetOk)}>{checkText(internetOk)}</strong>
      </div>
      <div className="check-row">
        <span>Microphone</span>
        <strong className={checkClassName(micOk)}>{checkText(micOk)}</strong>
      </div>
      <div className="check-row">
        <span>Lighting</span>
        <strong className={checkClassName(lightingOk)}>{checkText(lightingOk)}</strong>
      </div>
    </div>
  );
}
