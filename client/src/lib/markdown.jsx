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

function matchListLine(line) {
  const expanded = line.replace(/\t/g, "    ");
  const match = expanded.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (!match) return null;
  return {
    indent: match[1].length,
    level: Math.floor(match[1].length / 4),
    type: /\d+\.$/.test(match[2]) ? "ol" : "ul",
    text: match[3],
  };
}

function renderListContainer(container) {
  const tag = container.type;
  const body = container.items.map((item) => {
    const children = item.children.map(renderListContainer).join("");
    return `<li>${inlineFormat(item.text)}${children}</li>`;
  }).join("");
  return `<${tag}>${body}</${tag}>`;
}

function renderListBlock(lines, startIndex) {
  const roots = [];
  const containers = [];
  let i = startIndex;

  for (; i < lines.length; i++) {
    const info = matchListLine(lines[i]);
    if (!info) break;

    let level = info.level;
    while (level > 0 && (!containers[level - 1] || containers[level - 1].items.length === 0)) {
      level -= 1;
    }
    if (level > containers.length) level = containers.length;

    let container = containers[level];
    if (!container || container.type !== info.type) {
      container = { type: info.type, items: [] };
      if (level === 0) {
        roots.push(container);
      } else {
        const parent = containers[level - 1];
        const parentItem = parent.items[parent.items.length - 1];
        parentItem.children.push(container);
      }
      containers[level] = container;
    }
    containers.length = level + 1;

    container.items.push({ text: info.text, children: [] });
  }

  return {
    html: roots.map(renderListContainer).join(""),
    nextIndex: i - 1,
  };
}

export function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const out = [];
  let inCode = false, codeBlock = [];

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

    // List items (supports nested 4-space indentation and ordered lists)
    if (matchListLine(line)) {
      const rendered = renderListBlock(lines, i);
      out.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    // Normal paragraph
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inCode && codeBlock.length) out.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);

  return out.join("\n");
}

/** React component that renders markdown as HTML */
export function RichText({ text, className="" }) {
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}
