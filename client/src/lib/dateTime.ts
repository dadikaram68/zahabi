/**
 * Format a persisted UTC timestamp in the user's local timezone.
 * Arabic uses صباحاً/مساءً; English uses AM/PM. Storage remains UTC.
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  language?: "ar" | "en"
): string {
  if (value === null || value === undefined || value === "") return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const resolvedLanguage =
    language ??
    (typeof document !== "undefined" && document.documentElement.lang.startsWith("en")
      ? "en"
      : typeof navigator !== "undefined" && navigator.language.startsWith("en")
        ? "en"
        : "ar");
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  const period =
    resolvedLanguage === "ar"
      ? values.dayPeriod === "AM"
        ? "صباحاً"
        : "مساءً"
      : values.dayPeriod;

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${period}`;
}

export function formatDateOnly(
  value: Date | string | number | null | undefined,
  language?: "ar" | "en"
): string {
  return formatDateTime(value, language).slice(0, 10);
}
