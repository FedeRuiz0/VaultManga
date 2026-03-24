const UUID_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

export function extractMangaDexUuid(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.match(UUID_REGEX);
  return match ? match[1].toLowerCase() : null;
}

export function normalizeMangaDexSourcePath(input) {
  const uuid = extractMangaDexUuid(input);
  if (!uuid) return null;
  return `mangadex://${uuid}`;
}