// Minimum pitch length. Shared by the intake form (live counter + callout)
// and the moderation pipeline (strict auto-reject), so the number the
// submitter sees is the number that is enforced.

export const MIN_PITCH_WORDS = 50;

// A "word" is any whitespace-separated token with at least one letter or
// digit in it, so stray punctuation, bullets and dashes don't count.
export function countWords(text) {
  if (!text) return 0;
  return String(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function meetsMinimumWords(text) {
  return countWords(text) >= MIN_PITCH_WORDS;
}
