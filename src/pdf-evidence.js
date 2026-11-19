const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const sentences = new Intl.Segmenter('ko', { granularity: 'sentence' });

export const citationColor = number => `var(--pdf-mark-${((number - 1) % 6) + 1})`;

export function citedSources(message) {
  const references = new Set([...message.content.matchAll(/\[(\d{1,2})\]/g)].map(match => Number(match[1])));
  return (message.sources || []).flatMap((source, index) => references.has(index + 1) ? [{ source, number: index + 1 }] : []);
}

function words(text) {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function terms(text) {
  const result = new Set();
  for (const word of words(text)) {
    if (word.length >= 2 || /^\d+$/.test(word)) result.add(word);
    if (/^[가-힣]{3,}$/.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) result.add(word.slice(index, index + 2));
    }
  }
  return result;
}

function shortPassages(text) {
  return [...sentences.segment(text)].flatMap(({ segment }) => {
    const sentence = segment.trim();
    if (sentence.length <= 45) return sentence.length >= 7 ? [sentence] : [];
    const clauses = sentence.split(/[,;，；](?!\d)/).map(clause => clause.trim()).filter(clause => clause.length >= 7 && clause.length <= 110);
    const tokens = [...sentence.matchAll(/\S+/g)];
    const windows = tokens.flatMap((start, index) => {
      if (index % 2 !== 0) return [];
      const next = tokens[Math.min(index + 7, tokens.length - 1)];
      const excerpt = sentence.slice(start.index, Math.min(start.index + 110, next.index + next[0].length)).trim();
      return excerpt.length >= 7 ? [excerpt] : [];
    });
    return [...clauses, ...windows];
  });
}

export function citationPassage(message, source, number) {
  if (source.region || !source.text) return '';
  const citations = [...message.content.matchAll(/\[(\d{1,2})\]/g)];
  const claims = citations.flatMap((match, index) => {
    if (Number(match[1]) !== number) return [];
    const previous = citations[index - 1];
    const distance = previous ? match.index - previous.index - previous[0].length : match.index;
    // Adjacent citations usually share a single claim.
    const start = previous && distance > 6 ? previous.index + previous[0].length : 0;
    return [message.content.slice(Math.max(start, match.index - 300), match.index)];
  });
  const claimTerms = terms(claims.join(' '));
  let best = '';
  let bestScore = 0;
  for (const passage of shortPassages(source.text)) {
    const passageTerms = terms(passage);
    const overlap = [...passageTerms].filter(term => claimTerms.has(term));
    const score = overlap.reduce((total, term) => total + Math.min(term.length, 7) + Number(/^\d+$/.test(term)), 0);
    const normalizedScore = score / Math.sqrt(passageTerms.size || 1);
    if ((overlap.length >= 2 || overlap.some(term => term.length >= 4)) && normalizedScore > bestScore) {
      best = passage;
      bestScore = normalizedScore;
    }
  }
  if (best) return best;
  if (source.kind === 'selection' && source.text.length <= 110) return source.text;
  return '';
}

export function normalizeEvidenceText(text) {
  return text.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}

export function evidenceTextMap(text) {
  let normalized = '';
  const starts = [];
  const ends = [];
  for (const { segment, index } of graphemes.segment(text)) {
    const value = normalizeEvidenceText(segment);
    normalized += value;
    for (let offset = 0; offset < value.length; offset += 1) {
      starts.push(index);
      ends.push(index + segment.length);
    }
  }
  return { normalized, starts, ends };
}

export function evidenceRange(text, passage) {
  const needle = normalizeEvidenceText(passage || '');
  if (!needle) return null;
  const exact = text.indexOf(needle);
  if (exact >= 0) return [exact, exact + needle.length];

  // Font ligatures and reading order can break otherwise matching excerpts.
  const length = Math.max(10, Math.ceil(needle.length * 0.65));
  for (let from = 0; from <= needle.length - length; from += 3) {
    const match = text.indexOf(needle.slice(from, from + length));
    if (match >= 0) return [match, match + length];
  }
  return null;
}
