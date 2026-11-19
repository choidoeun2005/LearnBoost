export function validPdfNotes(notes, pages) {
  return Array.isArray(notes) && notes.length > 0 && notes.length <= 200 && notes.every(note => (
    note && Number.isInteger(note.page) && note.page >= 1 && note.page <= pages &&
    [note.excerpt ?? '', note.question, note.answer].every(text => typeof text === 'string' && text.length <= 30000) &&
    note.question.trim() && note.answer.trim()
  ));
}

export async function withPdfNotes(bytes, notes) {
  const { PDFDocument, PDFHexString } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const perPage = new Map();
  for (const note of notes) {
    const page = pdf.getPage(note.page - 1);
    const sequence = perPage.get(note.page) || 0;
    perPage.set(note.page, sequence + 1);
    const crop = page.getCropBox();
    const size = Math.min(20, crop.width, crop.height);
    const gap = size + 4;
    const rows = Math.max(1, Math.floor((crop.height - 8) / gap));
    const x = Math.max(crop.x, crop.x + crop.width - size - 4 - Math.floor(sequence / rows) * gap);
    const y = Math.max(crop.y, crop.y + crop.height - size - 4 - (sequence % rows) * gap);
    const contents = [note.excerpt?.trim(), `질문\n${note.question.trim()}`, `답변\n${note.answer.trim()}`].filter(Boolean).join('\n\n');
    const annotation = pdf.context.obj({
      Type: 'Annot', Subtype: 'Text', Name: 'Comment', P: page.ref,
      Rect: [x, y, x + size, y + size], C: [0.25, 0.64, 0.52], F: 4, Open: false,
      T: PDFHexString.fromText('LearnBoost 필기'), Contents: PDFHexString.fromText(contents),
    });
    page.node.addAnnot(pdf.context.register(annotation));
  }
  return pdf.save();
}
