export type CandidateProfile = {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  updated_at: string;
};

export type CheckStatus = boolean | null;
export type SetupChecks = {
  device: CheckStatus;
  internet: CheckStatus;
  mic: CheckStatus;
  lighting: CheckStatus;
};

export function getCandidateProfile(): CandidateProfile | null {
  try {
    const raw = window.localStorage.getItem("candidate_profile");
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CandidateProfile;
  } catch {
    return null;
  }
}

export function saveCandidateProfile(profile: CandidateProfile) {
  window.localStorage.setItem("candidate_profile", JSON.stringify(profile));
}

export function isValidName(value: string): boolean {
  return /^[A-Za-z][A-Za-z' -]{0,48}$/.test(String(value || "").trim());
}

export function detectMobileClientSide(): boolean {
  const ua = (navigator.userAgent || "").toLowerCase();
  const mobileRegex = /android|iphone|ipad|ipod|mobile|iemobile|opera mini|tablet|silk|kindle/;
  const touchMac = ua.includes("macintosh") && navigator.maxTouchPoints > 1;
  const desktopRegex = /windows nt|x11;|cros|linux x86_64|macintosh/;
  if (desktopRegex.test(ua) && !touchMac) {
    return false;
  }
  return mobileRegex.test(ua) || touchMac;
}

export function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}
