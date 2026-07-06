const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIELD_LABELS: Record<string, string> = {
  goalAmountCents: "Goal amount",
  merchantName: "Merchant",
  bufferPct: "Buffer",
  leadId: "Lead",
};

function humanizeField(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/** Flattened zod errors look like { formErrors: string[], fieldErrors: { [field]: string[] } }. */
function formatValidationError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { formErrors, fieldErrors } = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
  if (!formErrors && !fieldErrors) return null;

  const messages = [
    ...(formErrors ?? []),
    ...Object.entries(fieldErrors ?? {}).map(([field, errs]) => `${humanizeField(field)}: ${errs[0]}`),
  ];

  return messages.length > 0 ? messages.join(". ") : null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : (formatValidationError(body.error) ?? "Something went wrong. Please try again.");
    throw new ApiError(res.status, message);
  }

  return body as T;
}
