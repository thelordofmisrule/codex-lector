/**
 * Lightweight Markdown-to-HTML for blog posts.
 * Supports: **bold**, *italic*, [links](url), ![images](url),
 * > blockquotes, `code`, ```code blocks```, ## headings, - lists,
 * YouTube/Vimeo URL auto-embeds, --- horizontal rules
 */

function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function inlineFormat(line) {
  let s = escapeHtml(line);
  // Images: ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  // Links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Bold: **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `text`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Auto-link bare URLs (but not already linked)
  s = s.replace(/(?<!href="|src=")(https?:\/\/[^\s<]+)/g, (url) => {
    // YouTube embed
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe></div>`;
    // Vimeo embed
    const vmMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vmMatch) return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vmMatch[1]}" allowfullscreen></iframe></div>`;
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
  });
  return s;
}

export function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const out = [];
  let inCode = false, codeBlock = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
        codeBlock = [];
        inCode = false;
      } else { inCode = true; }
      continue;
    }
    if (inCode) { codeBlock.push(line); continue; }

    // Close list if needed
    if (inList && !line.startsWith("- ") && !line.startsWith("* ") && line.trim() !== "") {
      out.push("</ul>");
      inList = false;
    }

    const trimmed = line.trim();

    // Empty line = paragraph break
    if (trimmed === "") { out.push(""); continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) { out.push("<hr/>"); continue; }

    // Headings
    if (trimmed.startsWith("### ")) { out.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`); continue; }
    if (trimmed.startsWith("## ")) { out.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`); continue; }

    // Blockquote
    if (trimmed.startsWith("> ")) { out.push(`<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`); continue; }

    // List items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    // Normal paragraph
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inCode && codeBlock.length) out.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
  if (inList) out.push("</ul>");

  return out.join("\n");
}

/** React component that renders markdown as HTML */
export function RichText({ text, className="" }) {
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
