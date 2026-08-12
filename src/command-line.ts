/**
 * Split a display-oriented command string into an executable and arguments
 * without invoking a shell. This intentionally supports the common quoted
 * path form used by `init` and `discover`; it is not a shell interpreter.
 */
export function splitCommandLine(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (quote) throw new Error("Command contains an unterminated quote.");
  if (current) words.push(current);
  return words;
}
