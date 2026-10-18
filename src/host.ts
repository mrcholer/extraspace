/**
 * Identity and storage, served by the control plane.
 *
 * CodeSpace used to invent its own identity: the sign-in screen asked for a
 * name and stored a UUID in localStorage. That is not an account. It cannot
 * say who owns a project, cannot be limited, and cannot tell the worker which
 * files belong to whom - the storage allowance on a plan means nothing if the
 * files are in one browser.
 *
 * So both of those move to the control plane, which already has all of it:
 * Discord sign-in, database-backed sessions, hosting plans, and a project
 * storage allowance enforced with XFS project quotas.
 *
 * Requests go to the same origin as this page. The reverse proxy forwards
 * /api to the control plane and preserves the Host header, which is what keeps
 * the control plane's sameOrigin() check satisfied legitimately rather than by
 * loosening it. The session cookie is scoped to the parent domain, so a person
 * who signs in on the hosting panel is already signed in here.
 */

export interface HostUser {
  _id: string;
  discordId: string;
  discordUsername: string;
  discordGlobalName: string;
  avatarUrl: string | null;
  role: string;
}

/** Matches Session in workspace.ts, which keys local state by user. */
export interface HostSession {
  name: string;
  email: string;
}

export class HostError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message =
      payload?.error?.message || `Request failed (${response.status}).`;
    throw new HostError(message, response.status);
  }
  return payload.data as T;
}

/** The signed-in person, or null when there is no valid session. */
export async function hostUser(): Promise<HostUser | null> {
  try {
    return await api<HostUser>("/api/me");
  } catch (error) {
    // 401 is the ordinary "not signed in" answer and must not read as a fault.
    if (error instanceof HostError && error.status === 401) return null;
    throw error;
  }
}

/**
 * Send the person to Discord sign-in and bring them back here.
 *
 * `from` is the page they were on, so a workspace opened from a plan in the
 * hosting panel returns to the workspace instead of the dashboard. The control
 * plane validates it server-side; nothing here decides where it may point.
 */
export function hostSignIn(from?: string) {
  const target = from ?? `${location.pathname}${location.search}`;
  location.assign(
    `/api/auth/discord?from=${encodeURIComponent(
      new URL(target, location.origin).toString(),
    )}`,
  );
}

export async function hostSignOut() {
  // The control plane owns the session, and its logout route is POST-only so
  // that a prefetch or an <img> cannot sign someone out by accident.
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  // 303 to the control plane's login. Following it lands them on the hosting
  // panel, which is the right place to sign back in.
  location.assign(response.redirected ? response.url : "/login");
}

/* ------------------------------------------------------------------ files */

export type HostFile = {
  path: string;
  size: number;
  editable: boolean;
  content?: string;
  language?: string;
  kind?: string;
};

export interface HostProject {
  _id: string;
  name: string;
  status: string;
  hostingPlan?: string;
  resourceLimits?: {
    memoryMb: number;
    cpu: number;
    storageMb: number;
    processes: number;
  };
}

/**
 * The person's CodeSpaces.
 *
 * Deliberately not /api/projects: that is the hosting dashboard's list and it
 * excludes codespace projects on purpose. This is the workspace's own
 * endpoint, so neither list has to pretend to be the other.
 */
export async function hostProjects(): Promise<{
  projects: HostProject[];
  access: { _id: string; plan: string; status: string; expiresAt: string }[];
}> {
  return api("/api/codespace/projects");
}

export async function hostListFiles(projectId: string): Promise<HostFile[]> {
  const data = await api<{ files: HostFile[] }>(
    `/api/projects/${projectId}/files`,
  );
  return data.files;
}

export async function hostReadFile(
  projectId: string,
  path: string,
): Promise<HostFile> {
  return api<HostFile>(
    `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
  );
}

export async function hostWriteFile(
  projectId: string,
  path: string,
  content: string,
) {
  await api(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify({ action: "write", path, content }),
  });
}

export async function hostDeleteFile(projectId: string, path: string) {
  await api(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify({ action: "delete", path }),
  });
}

export async function hostMoveFile(
  projectId: string,
  path: string,
  destination: string,
) {
  await api(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify({ action: "move", path, destination }),
  });
}

export async function hostMkdir(projectId: string, path: string) {
  await api(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify({ action: "mkdir", path }),
  });
}