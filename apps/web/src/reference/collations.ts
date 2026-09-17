// Explicit corrections to the imported transcription. Keep both the change and
// its corroborating classical-text source visible to readers and maintainers.
export const COLLATIONS: Record<number, { note: string; source: string }> = {
  13: { note: '九四“弗克，攻吉”断句校为“弗克攻，吉”。', source: 'https://ctext.org/dictionary.pl?char=乘其墉弗克攻吉&if=gb' },
  23: { note: '卦辞“不利。有攸往”断句校为“不利有攸往”。', source: 'https://ctext.org/text.pl?if=gb&node=25410&show=parallel' },
  24: { note: '初九“不復遠，无袛悔”据对读校为“不遠復，无祗悔”。', source: 'https://ctext.org/book-of-changes/fu' },
};
