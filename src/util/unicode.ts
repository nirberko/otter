// Ranges of characters that carry no legitimate visible meaning inside a tool
// description — hiding instructions here is a known tool-poisoning technique.
const HIDDEN_RANGES: [number, number][] = [
  [0x200b, 0x200f], // zero-width space/joiner + LTR/RTL marks
  [0x202a, 0x202e], // bidi embedding/override
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space / BOM
  [0xe0000, 0xe007f], // unicode tag characters (used to smuggle ASCII)
]

function isHidden(codePoint: number): boolean {
  return HIDDEN_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
}

export interface HiddenScan {
  hasHidden: boolean
  count: number
  // The string with hidden chars replaced by U+FFFD so a report can show where.
  annotated: string
}

export function scanHidden(text: string): HiddenScan {
  let count = 0
  let annotated = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isHidden(cp)) {
      count++
      annotated += '�'
    } else {
      annotated += ch
    }
  }
  return { hasHidden: count > 0, count, annotated }
}
