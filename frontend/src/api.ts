export type DeviceCheckResponse = {
  ok: boolean;
  is_mobile: boolean;
  supported: boolean;
};

export type SetupConfigResponse = {
  ok: boolean;
  mobile_detected: boolean;
  min_download_mbps: number;
};

export type AdminUserSummary = {
  key: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  samples: number;
  violation_count: number;
  last_violation: string;
};

export type AdminUserEvent = {
  timestamp: string;
  violations: string[];
  image_url: string;
};

type JsonRecord = Record<string, unknown>;

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(String(payload.error ?? `Request failed (${response.status})`));
  }
  return payload as T;
}

export function fetchDeviceCheck(): Promise<DeviceCheckResponse> {
  return apiJson<DeviceCheckResponse>("/device_check", { method: "GET" });
}

export function fetchSetupConfig(): Promise<SetupConfigResponse> {
  return apiJson<SetupConfigResponse>("/api/setup_config", { method: "GET" });
}

export function postJson<T>(url: string, body: JsonRecord): Promise<T> {
  return apiJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function adminLogin(password: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/admin/login", { password });
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/admin/logout", {});
}

export function fetchAdminSession(): Promise<{ ok: boolean; authenticated: boolean }> {
  return apiJson<{ ok: boolean; authenticated: boolean }>("/api/admin/session", { method: "GET" });
}

export function fetchAdminUsers(): Promise<{ ok: boolean; users: AdminUserSummary[] }> {
  return apiJson<{ ok: boolean; users: AdminUserSummary[] }>("/api/admin/users", { method: "GET" });
}

export function fetchAdminUser(
  userKey: string
): Promise<{
  ok: boolean;
  user_key: string;
  user: { username: string; first_name: string; last_name: string; email: string; samples: number };
  events: AdminUserEvent[];
}> {
  return apiJson(`/api/admin/user/${encodeURIComponent(userKey)}`, { method: "GET" });
}
