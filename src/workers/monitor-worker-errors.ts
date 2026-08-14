type ErrorLike = {
  name?: unknown;
  message?: unknown;
  cause?: unknown;
  code?: unknown;
  detail?: unknown;
  hint?: unknown;
  query?: unknown;
  params?: unknown;
};

function asErrorLike(value: unknown): ErrorLike | null {
  return value !== null && typeof value === "object" ? value as ErrorLike : null;
}

function stringProperty(value: ErrorLike | null, property: keyof ErrorLike) {
  const result = value?.[property];
  return typeof result === "string" && result.length > 0 ? result : undefined;
}

export function describeMonitorError(error: unknown) {
  if (typeof error === "string") return { name: "unknown", message: error };

  const wrapper = asErrorLike(error);
  const cause = asErrorLike(wrapper?.cause);
  const root = cause ?? wrapper;
  const description: {
    name: string;
    message: string;
    code?: string;
    detail?: string;
    hint?: string;
    query?: string;
    parameterCount?: number;
  } = {
    name: stringProperty(wrapper, "name") ?? "unknown",
    message: stringProperty(root, "message") ?? "Unknown monitor error.",
  };

  for (const property of ["code", "detail", "hint"] as const) {
    const value = stringProperty(root, property);
    if (value) description[property] = value;
  }

  const query = stringProperty(wrapper, "query");
  if (query) description.query = query;
  if (Array.isArray(wrapper?.params)) description.parameterCount = wrapper.params.length;

  return description;
}
