import type { UnitInfo } from "./types";

// Array of source IDs that should display the frontmatter "ref" property as a title prefix
export const SOURCES_WITH_NUMBERED_TOC = ["col"];

/**
 * Formats a unit title by optionally prefixing it with its "ref" (e.g., chapter number)
 * if the source is configured to use numbered titles.
 */
export function formatUnitTitle(unit: UnitInfo, sourceId: string | undefined): string {
  if (unit.ref && sourceId && SOURCES_WITH_NUMBERED_TOC.includes(sourceId)) {
    return `${unit.ref}. ${unit.title}`;
  }
  return unit.title;
}

/**
 * Helper to get a localized UI prompt with cascading fallbacks:
 * 1. Book specific prompt override
 * 2. Collection specific prompt override
 * 3. Source specific prompt override
 * 4. English default string
 */
export function getPrompt(
  key: string,
  defaultString: string,
  book?: any,
  collection?: any,
  source?: any
): string {
  if (book?.prompts?.[key]) return book.prompts[key];
  if (collection?.prompts?.[key]) return collection.prompts[key];
  if (source?.prompts?.[key]) return source.prompts[key];
  return defaultString;
}
