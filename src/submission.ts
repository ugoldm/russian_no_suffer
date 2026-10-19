// Safari reports a failed fetch as "Load failed"; Chromium and Firefox use
// different messages. Retry only transport failures, never validation errors.
export function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  return /^(?:TypeError:\s*)?(?:Load failed|Failed to fetch|Network request failed|NetworkError(?: when attempting to fetch resource)?)[.!]?$/i.test(
    message.trim(),
  );
}

export async function submitWithRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    // submit_attempt is idempotent: repeating the same attempt also recovers
    // the result when the server committed it but the response was lost.
    await new Promise((resolve) => setTimeout(resolve, 750));
    return await send();
  }
}

export function submissionErrorText(error: unknown): string {
  return isNetworkError(error)
    ? "Не удалось получить подтверждение от сервера. Ответы остаются на странице. Проверьте интернет и снова нажмите «Завершить и проверить»."
    : error instanceof Error
      ? error.message
      : "Не удалось отправить ответы. Попробуйте ещё раз.";
}
