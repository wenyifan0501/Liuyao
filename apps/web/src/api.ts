export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}) },
  });
  const value = await response.json();
  if (!response.ok) throw new ApiError(response.status, value.error?.message ?? "服务暂时不可用，请稍后重试");
  return value;
}
