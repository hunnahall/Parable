import { jsPDF } from 'jspdf'
import TurndownService from 'turndown'

// Client-side only — content is already on the page by the time export is
// triggered, so there's no server round-trip needed for either format.

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportAsMarkdown(title: string, contentHtml: string, filename: string) {
  const turndown = new TurndownService()
  const body = turndown.turndown(contentHtml)
  const markdown = `# ${title}\n\n${body}\n`
  downloadBlob(new Blob([markdown], { type: 'text/markdown' }), filename)
}

// jsPDF's .html() (html2canvas-backed) is the richer option but is known
// to be fragile against arbitrary publisher-derived markup — cell/table
// layouts and some CSS combinations can throw or silently mis-render. It
// runs against a real, attached-but-offscreen DOM node so html2canvas can
// measure it; on any failure this falls back to a plain-text paginated
// layout (deterministic, always produces a valid file) rather than
// surfacing a broken export to the user.
export async function exportAsPdf(title: string, contentHtml: string, filename: string) {
  try {
    await exportAsPdfViaHtml(title, contentHtml, filename)
  } catch (err) {
    console.error('exportAsPdf: .html() renderer failed, falling back to plain text', err)
    exportAsPdfPlainText(title, contentHtml, filename)
  }
}

function exportAsPdfViaHtml(title: string, contentHtml: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '0'
    container.style.width = '600px'
    container.style.fontFamily = 'Georgia, serif'
    container.style.fontSize = '13px'
    container.style.lineHeight = '1.5'
    container.innerHTML = `<h1 style="font-size:20px;margin-bottom:12px;">${escapeHtml(title)}</h1>${contentHtml}`
    document.body.appendChild(container)

    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const cleanup = () => container.remove()

    doc
      .html(container, {
        margin: [40, 40, 40, 40],
        autoPaging: 'text',
        width: 530,
        windowWidth: 600,
        callback: (finishedDoc) => {
          try {
            finishedDoc.save(filename)
            resolve()
          } catch (err) {
            reject(err)
          } finally {
            cleanup()
          }
        },
      })
      .catch((err: unknown) => {
        cleanup()
        reject(err)
      })
  })
}

function exportAsPdfPlainText(title: string, contentHtml: string, filename: string) {
  const text = htmlToPlainText(contentHtml)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  const titleLines: string[] = doc.splitTextToSize(title, maxWidth)
  for (const line of titleLines) {
    doc.text(line, margin, y)
    y += 20
  }
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const paragraphs = text.split('\n').filter((p) => p.trim())
  for (const paragraph of paragraphs) {
    const lines: string[] = doc.splitTextToSize(paragraph, maxWidth)
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += 15
    }
    y += 8
  }

  doc.save(filename)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function htmlToPlainText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html.replace(/<\/(p|div|li|h[1-6])\s*>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n')
  return (div.textContent ?? '').replace(/\n{2,}/g, '\n').trim()
}
