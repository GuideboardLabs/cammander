/**
 * Lightweight markdown → HTML renderer.
 * Escapes HTML first (XSS-safe), then re-adds safe markdown-derived tags.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = escapeHtml(md);

  // Fenced code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists: group consecutive - lines into <ul>
  html = html.replace(/(?:^- (.+)(?:\n|$)){2,}/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l: string) => `<li>${l.replace(/^- /, '')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });
  html = html.replace(/^- (.+)$/gm, '<ul><li>$1</li></ul>');

  // Ordered lists
  html = html.replace(/(?:^\d+\. (.+)(?:\n|$)){2,}/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l: string) => `<li>${l.replace(/^\d+\. /, '')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });
  html = html.replace(/^\d+\. (.+)$/gm, '<ol><li>$1</li></ol>');

  // Paragraphs: wrap lines that aren't already in a block element
  html = html.replace(/\n\n+/g, '\n</p><p>\n');
  const blockTags = /^<(pre|h[1-3]|ul|ol|blockquote|hr)/;
  const parts = html.split(
    /(<\/?p>|<pre[\s\S]*?<\/pre>|<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<blockquote[\s\S]*?<\/blockquote>|<hr\s*\/?>)/,
  );
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p || p.startsWith('<')) {
      result += p;
      continue;
    }
    const lines = p.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (blockTags.test(trimmed)) {
        result += trimmed;
        continue;
      }
      result += `<p>${trimmed}</p>`;
    }
  }
  // Clean up nested <p> tags
  result = result.replace(/<p><p>/g, '<p>').replace(/<\/p><\/p>/g, '</p>');
  result = result.replace(/<p><\/p>/g, '');

  // Newlines inside <p> become spaces; inside <pre> they stay
  result = result.replace(/<p>([\s\S]*?)<\/p>/g, (_, inner) => {
    return `<p>${inner.replace(/\n/g, ' ')}</p>`;
  });

  return result;
}