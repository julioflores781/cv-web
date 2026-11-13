/** True when the source calls or references a `console.` member (spaces before the dot included). */
export function usesConsole(content: string): boolean {
  return /\bconsole\s*\.\s*[a-z]+/.test(content);
}
