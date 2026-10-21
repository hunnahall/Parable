// Roughly 3,000 words. Longer articles are translated this far and the
// reader view points to the publisher for the rest.
export const READER_INPUT_MAX_LENGTH = 12_000
// English output for that input plus the reasoning floor.
export const READER_MAX_OUTPUT_TOKENS = 6_000

export function readerInstructions(targetName: string): string {
  return (
    `Translate this news article into ${targetName}. Keep every paragraph, ` +
    `separated by a blank line, and keep names, numbers and quotes exact. ` +
    `The text was extracted from a web page and may still contain ads, ` +
    `newsletter prompts, photo credits or links to other articles; leave ` +
    `those out. Output only the translated article, with no title, preamble ` +
    `or notes.`
  )
}
