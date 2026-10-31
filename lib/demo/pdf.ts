const LINES_PER_PAGE = 46
const MAX_LINE_CHARS = 92

function wrap(text: string): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of paragraph.split(/\s+/)) {
      if ((current + ' ' + word).trim().length > MAX_LINE_CHARS) {
        lines.push(current)
        current = word
      } else {
        current = (current + ' ' + word).trim()
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

const escapePdf = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')

/** Splits text into pages exactly as the PDF renderer will lay them out. */
export function paginate(text: string): string[] {
  const lines = wrap(text)
  const pages: string[] = []
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'))
  }
  return pages.length ? pages : ['']
}

/** Minimal, valid PDF 1.4 writer (Helvetica, US Letter) producing real binaries. */
export function buildPdf(title: string, pages: string[]): Blob {
  const objects: string[] = []
  const pageCount = pages.length
  const fontObj = 3
  const firstPageObj = 4
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(' ')
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((pageText, i) => {
    const pageObj = firstPageObj + i * 2
    const contentObj = pageObj + 1
    const ops: string[] = ['BT', '/F1 15 Tf', '56 740 Td', `(${escapePdf(title)}) Tj`, '/F1 10 Tf', '0 -26 Td', '14 TL']
    for (const line of pageText.split('\n')) ops.push(`(${escapePdf(line)}) Tj T*`)
    ops.push('ET', 'BT', '/F1 8 Tf', '56 30 Td', `(Page ${i + 1} of ${pageCount} - Fictional demo document) Tj`, 'ET')
    const stream = ops.join('\n')
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefOffset = body.length
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) body += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Blob([body], { type: 'application/pdf' })
}
