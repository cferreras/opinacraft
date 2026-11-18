/**
 * Better Auth rejects callback URLs with a `#fragment` (403 INVALID_CALLBACK_URL), so strip it
 * before handing the URL to the auth client. Keep the original for client-side navigation.
 */
export function withoutFragment(url: string) {
  const index = url.indexOf("#");
  return index === -1 ? url : url.slice(0, index);
}

export function safeCallbackUrl(
  value: string | null | undefined,
  fallback: string,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  return value;
}
