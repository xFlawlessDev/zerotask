import type { ApiError } from "./types";

/**
 * One HTTP client for the whole app.
 *
 * It throws `ApiError` instead of returning a result object: every caller is a
 * React Query hook, and React Query's error path already means "this failed", so a
 * second discriminated union on top of it only adds branches to every page.
 */

const BASE = "/api";

/** Better Auth's bearer token, kept under one key and read in one place. */
const TOKEN_KEY = "zerotask.token";

export function getToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Multipart bodies are posted as-is; anything else is JSON. */
  form?: FormData;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    // Content-Type is deliberately unset: the browser adds the multipart boundary.
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    signal: options.signal,
    credentials: "same-origin",
  });

  // A 401 means the token is stale. Clearing it lets the shell fall back to the
  // sign-in screen instead of retrying a request that cannot succeed.
  if (response.status === 401) {
    setToken(null);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const error: ApiError =
      isJson && payload && typeof payload === "object" && "code" in payload
        ? (payload as ApiError)
        : {
            code: `HTTP_${response.status}`,
            message:
              typeof payload === "string" && payload.length > 0
                ? payload
                : `The request failed with status ${response.status}`,
          };

    throw new ApiRequestError(response.status, error);
  }

  return payload as T;
}

/** Builds a query string, skipping empty values so a filter is absent, not `="".` */
export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : "";
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};

/**
 * Auth calls go through Better Auth's own endpoints. They are mounted under
 * `/api/auth` and answer with `{ token }` when the bearer plugin is active.
 */
export async function signIn(input: { email: string; password: string }): Promise<void> {
  const response = await fetch(`${BASE}/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });

  const payload = (await response.json().catch(() => null)) as
    | { token?: string; message?: string; code?: string }
    | null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, {
      code: payload?.code ?? `HTTP_${response.status}`,
      message:
        response.status === 401 || response.status === 400
          ? "That email and password do not match an account"
          : (payload?.message ?? "Sign-in failed"),
    });
  }

  storeBearerToken(response, payload);
}

/**
 * The bearer plugin sends the signed token in `set-auth-token`. The body carries the
 * raw session token, which the server will not accept as a bearer, so the header wins.
 */
function storeBearerToken(response: Response, payload: { token?: string } | null): void {
  const signed = response.headers.get("set-auth-token") ?? payload?.token;
  if (signed) setToken(signed);
}


export async function signUp(input: {
  email: string;
  password: string;
  name: string;
}): Promise<void> {
  const response = await fetch(`${BASE}/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });

  const payload = (await response.json().catch(() => null)) as
    | { token?: string; message?: string; code?: string }
    | null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, {
      code: payload?.code ?? `HTTP_${response.status}`,
      message:
        response.status === 422 && payload?.message
          ? payload.message
          : (payload?.message ?? "That account could not be created"),
    });
  }

  storeBearerToken(response, payload);
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/auth/sign-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    credentials: "same-origin",
  }).catch(() => undefined);

  setToken(null);
}
