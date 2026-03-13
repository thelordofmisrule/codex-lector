import { Link } from "react-router-dom";

const sourceCards = [
  {
    title: "Ovid, Fasti Book II",
    subtitle: "Frazer translation",
    note: "The Lucretia section begins at [685].",
    links: [
      { label: "Open on Theoi", href: "https://www.theoi.com/Text/OvidFasti2.html" },
    ],
  },
  {
    title: "Livy, History of Rome Book I",
    subtitle: "The Lucretia narrative",
    links: [
      { label: "Chapter 57", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=57" },
      { label: "Chapter 58", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=58" },
      { label: "Chapter 59", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=59" },
    ],
  },
  {
    title: "Chaucer, Legend of Good Women",
    note: 'Search within the text for "Lucrece".',
    links: [
      { label: "Open on Project Gutenberg", href: "https://www.gutenberg.org/files/2383/2383-h/2383-h.htm" },
    ],
  },
  {
    title: "Painter, The Palace of Pleasure (1566)",
    links: [
      { label: "Open on Internet Archive", href: "https://archive.org/details/palaceofpleasure00pain" },
    ],
  },
];

export default function LucreceSourcesPage() {
  return (
    <div className="animate-in" style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{ fontSize: 13, fontFamily: "var(--font-display)", color: "var(--gold)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
          Supplementary Reading
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 400, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
          Sources of Lucrece
        </h1>
        <p style={{ fontFamily: "var(--font-fell)", fontSize: 18, fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 680, margin: "0 auto" }}>
          Classical and later source texts for readers who want to place Shakespeare&apos;s poem beside the older Lucretia tradition.
        </p>
      </div>

      <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
        {sourceCards.map((item) => (
          <section key={item.title} style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontFamily: "var(--font-display)", letterSpacing: 2, color: "var(--text-light)", textTransform: "uppercase", marginBottom: 8 }}>
              Source
            </div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", fontWeight: 400 }}>
              {item.title}
            </h2>
            {item.subtitle && (
              <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", marginBottom: 8 }}>
                {item.subtitle}
              </div>
            )}
            {item.note && (
              <div style={{ color: "var(--text)", lineHeight: 1.75, marginBottom: 12 }}>
                {item.note}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {item.links.map((link) => (
                <a
                  key={link.href}
                  className="btn btn-secondary btn-sm"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "var(--font-display)", letterSpacing: 1 }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={{ textAlign: "center" }}>
        <Link to="/read/rape-of-lucrece" className="btn btn-primary" style={{ marginRight: 8 }}>
          Read Lucrece
        </Link>
        <Link to="/year-of-shakespeare" className="btn btn-secondary">
          Year of Shakespeare
        </Link>
      </div>
    </div>
  );
}
