/** Lightweight markdown → HTML for co-pilot bubbles (no external dep). */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderMarkdownToHtml(raw: string): string {
  if (!raw) return ''
  let text = escapeHtml(raw)

  text = text.replace(/^### (.+)$/gm, '<h4 class="chat-md-h">$1</h4>')
  text = text.replace(/^## (.+)$/gm, '<h3 class="chat-md-h">$1</h3>')
  text = text.replace(/^# (.+)$/gm, '<h2 class="chat-md-h">$1</h2>')
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/`([^`]+)`/g, '<code class="chat-md-code">$1</code>')
  text = text.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
  text = text.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul class="chat-md-ul">${m}</ul>`)
  text = text.replace(/\n\n/g, '</p><p class="chat-md-p">')
  text = text.replace(/\n/g, '<br/>')

  if (!text.startsWith('<')) {
    text = `<p class="chat-md-p">${text}</p>`
  }
  return text
}