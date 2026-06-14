import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `\u003cpre class="hljs"\u003e\u003ccode class="language-${language}"\u003e${highlighted}\u003c/code\u003e\u003c/pre\u003e`;
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

export function renderMarkdown(input: string): string {
  if (!input) return '';
  const raw = marked.parse(input) as string;
  return DOMPurify.sanitize(raw);
}
