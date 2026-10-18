export const DEFAULT_APPLICATION_TITLE = "الذهبي للمحاسبة";

export function getApplicationTitle(value = import.meta.env.VITE_APP_TITLE) {
  return value?.trim() || DEFAULT_APPLICATION_TITLE;
}
