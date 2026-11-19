const proposalFingerprint = 'dd7b9d66d1adf0a4da90bcb8676d71a4';
const proposalGlyphs = { '\uE02C': 'a', '\uE06F': '6', '\uE070': '9' };

export function repairPdfText(content, fingerprint) {
  if (fingerprint !== proposalFingerprint) return content;
  // The source proposal's character map encodes these three glyphs as private-use characters.
  return {
    ...content,
    items: content.items.map(item => typeof item.str === 'string'
      ? { ...item, str: item.str.replace(/[\uE02C\uE06F\uE070]/g, glyph => proposalGlyphs[glyph]) }
      : item),
  };
}
