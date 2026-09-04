/**
 * iMessage is plain text — it does not render Markdown. Strip any Markdown the
 * model might emit so `**bold**` / `# heading` / `- list` never show as literal
 * characters in the parent's Messages app.
 */
export function toPlainText(s: string): string {
  return s
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1') // **bold**
    .replace(/__([\s\S]+?)__/g, '$1') // __underline__
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '') // # headings
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ') // "- bullet" → "• bullet"
    .replace(/\n{3,}/g, '\n\n') // collapse extra blank lines
    .trim();
}
