// ─── Player identity: a self-chosen single letter + a random 4-digit tag ───
// The letter is the only user input and is restricted to A–Z, so there is no
// abuse vector; the tag tells players with the same letter apart.

/** Validate a user-supplied initial: exactly one letter A–Z, upper-cased. */
export function parseInitial(raw: string | null): string {
  return raw && /^[A-Za-z]$/.test(raw) ? raw.toUpperCase() : '?';
}

/** A random 4-digit tag (1000–9999) not currently in use. */
export function randomTag(taken: Set<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 200; i++) {
    const tag = String(1000 + Math.floor(rand() * 9000));
    if (!taken.has(tag)) return tag;
  }
  for (let n = 1000; n <= 9999; n++) if (!taken.has(String(n))) return String(n);
  return '0000'; // 9000 players online at once — tags may repeat
}
