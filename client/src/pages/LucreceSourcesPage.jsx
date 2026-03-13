import { Link } from "react-router-dom";

const sourceCards = [
  {
    title: "Ovid, Fasti Book II",
    subtitle: "c. 8 AD · Frazer translation",
    note: "The Lucretia section begins at [685].",
    image: {
      src: "https://upload.wikimedia.org/wikipedia/commons/3/34/Giovanni_Battista_Tiepolo_090.jpg",
      alt: "Giovanni Battista Tiepolo painting used for the Ovid source card",
    },
    description: "The closest source. Shakespeare was working from Ovid almost line by line. The Fasti is a Roman calendar poem, and the Lucretia story appears under February 24, the Regifugium, the festival commemorating the expulsion of the kings. Ovid gives Shakespeare the psychological interior: Tarquin's obsessive mental image of Lucretia after the soldiers' visit, the lamb-and-wolf simile, and the threat to lay a dead slave beside her body. Shakespeare takes Ovid's emotional and poetic texture and amplifies it enormously: where Ovid gives Lucretia's lament eight lines, Shakespeare gives her hundreds.",
    links: [
      { label: "Open on Theoi", href: "https://www.theoi.com/Text/OvidFasti2.html" },
    ],
  },
  {
    title: "Livy, History of Rome Book I",
    subtitle: "c. 27-9 BC",
    image: {
      src: "https://upload.wikimedia.org/wikipedia/commons/d/d6/Titus-Livius-Austrian-Parliament-Building.jpg",
      alt: "Bust of Livy at the Austrian Parliament Building",
    },
    description: "The historical foundation. Livy's account is spare and political, less interested in Lucretia's inner life than in the constitutional consequences of her death: the oath of Brutus, the expulsion of the Tarquins, and the founding of the Roman Republic. Shakespeare takes Livy's narrative skeleton, the wager among the soldiers, the visit to Collatia, the summons to father and husband, the suicide, and transplants it into Ovid's psychological register. Livy's Brutus, the man who feigned stupidity to survive under tyranny and then revealed himself at the moment of crisis, also haunts the poem's ending.",
    links: [
      { label: "Chapter 57", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=57" },
      { label: "Chapter 58", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=58" },
      { label: "Chapter 59", href: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.02.0151:book=1:chapter=59" },
    ],
  },
  {
    title: "Chaucer, Legend of Good Women",
    subtitle: "c. 1386-88",
    note: 'Search within the text for "Lucrece".',
    image: {
      src: "https://upload.wikimedia.org/wikipedia/commons/5/57/Chaucer_manuscrit_portrait_%28d%C3%A9tail%29.jpeg",
      alt: "Manuscript portrait of Geoffrey Chaucer",
    },
    description: "The most important English precedent. Chaucer's Legend is a sequence of stories about faithful women wronged by men, and Lucretia is one of its legends. By writing Lucrece, Shakespeare was entering this tradition and rewriting it: where Chaucer's Lucretia is a straightforward exemplum of female virtue, Shakespeare's becomes a more complex interiority wrestling with shame, guilt, honor, and the injustice of a world that punishes the victim. Chaucer also helped establish the iambic decasyllabic line as a prestige form for English narrative poetry, the metrical inheritance behind Shakespeare's rhyme royal stanzas.",
    links: [
      { label: "Open on Project Gutenberg", href: "https://www.gutenberg.org/files/2383/2383-h/2383-h.htm" },
    ],
  },
  {
    title: "Painter, The Palace of Pleasure (1566)",
    image: {
      src: "https://www.gutenberg.org/cache/epub/20241/images/jacobstitle.png",
      alt: "Opening page scan of Painter's Palace of Pleasure",
    },
    description: "The likely book on Shakespeare's desk. Painter's Palace is an English prose anthology drawn from classical sources, and he translated the Lucretia story directly from Livy into Tudor English prose. It was enormously popular and widely read in Shakespeare's time, and it served as one of the chief intermediaries through which classical stories reached English readers who could not read Latin. Shakespeare probably read both Painter and the Latin originals; Painter's version helps explain details in the poem that follow Livy's phrasing closely, suggesting Shakespeare had both open at once.",
    links: [
      { label: "Open on Project Gutenberg", href: "https://www.gutenberg.org/files/20241/20241-h/20241-h.htm" },
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
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
              {item.image && (
                <div style={{ display: "block", flex: "0 0 220px", maxWidth: "100%" }}>
                  <img
                    src={item.image.src}
                    alt={item.image.alt}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", maxWidth: 220, display: "block", borderRadius: 10, border: "1px solid var(--border-light)", boxShadow: "0 8px 18px var(--shadow)", background: "var(--bg)" }}
                  />
                </div>
              )}
              <div style={{ flex: "1 1 380px", minWidth: 0 }}>
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
                  <div style={{ color: "var(--text)", lineHeight: 1.75, marginBottom: 10 }}>
                    {item.note}
                  </div>
                )}
                {item.description && (
                  <div style={{ color: "var(--text)", lineHeight: 1.8, marginBottom: 14 }}>
                    {item.description}
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
              </div>
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
