const express = require("express");
const db = require("../db");
const r = express.Router();

/* Look up a word: frequency across works, total count, example contexts */
r.get("/:word", (req, res) => {
  const word = req.params.word.toLowerCase().replace(/[^a-z']/g, "");
  if (!word || word.length < 2) return res.status(400).json({ error:"Word too short." });

  // Get frequency per work
  const freq = db.prepare(`
    SELECT wi.count, w.title, w.slug
    FROM word_index wi JOIN works w ON wi.work_id=w.id
    WHERE wi.word=? ORDER BY wi.count DESC
  `).all(word);

  const totalCount = freq.reduce((s, f) => s + f.count, 0);
  const worksAppearingIn = freq.length;

  // Get total unique words in index for relative frequency
  const totalWords = db.prepare("SELECT SUM(count) as n FROM word_index").get()?.n || 1;

  // Find a few example line contexts from the actual content
  const examples = [];
  if (freq.length > 0) {
    // Search up to 3 works for contextual snippets
    const worksToSearch = freq.slice(0, 3);
    for (const f of worksToSearch) {
      const work = db.prepare("SELECT content FROM works WHERE slug=?").get(f.slug);
      if (!work?.content) continue;
      const text = work.content.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      let match;
      let found = 0;
      while ((match = regex.exec(text)) !== null && found < 2) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(text.length, match.index + word.length + 40);
        let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
        if (start > 0) snippet = "…" + snippet;
        if (end < text.length) snippet += "…";
        examples.push({ work:f.title, slug:f.slug, snippet });
        found++;
      }
    }
  }

  // Simple Shakespeare-era glossary (common words that differ from modern English)
  const glossary = getGlossEntry(word);

  res.json({
    word,
    totalCount,
    worksAppearingIn,
    relativeFrequency: totalCount / totalWords,
    frequency: freq.map(f => ({ title:f.title, slug:f.slug, count:f.count })),
    examples: examples.slice(0, 5),
    gloss: glossary,
  });
});

/* Bulk lookup — for autocomplete or batch */
r.get("/", (req, res) => {
  const prefix = (req.query.prefix || "").toLowerCase().replace(/[^a-z']/g, "");
  if (!prefix || prefix.length < 2) return res.json([]);
  const words = db.prepare(`
    SELECT word, SUM(count) as total FROM word_index
    WHERE word LIKE ? GROUP BY word ORDER BY total DESC LIMIT 20
  `).all(`${prefix}%`);
  res.json(words);
});

/**
 * Simple built-in glossary for common Shakespearean/Early Modern English words.
 * This is a starter set — could be expanded or replaced with API calls.
 */
function getGlossEntry(word) {
  const glossary = {
    "thee":"You (singular, objective case — used for familiarity or to address inferiors).",
    "thou":"You (singular, subjective case — intimate or informal).",
    "thy":"Your (singular possessive).",
    "thine":"Yours, or your (before a vowel sound).",
    "hath":"Has.",
    "doth":"Does.",
    "art":"Are (second person singular: 'thou art').",
    "ere":"Before.",
    "hither":"To this place; here.",
    "thither":"To that place; there.",
    "whither":"To where; to what place.",
    "hence":"From this place; away.",
    "thence":"From that place.",
    "wherefore":"Why; for what reason. (Not 'where'.)",
    "prithee":"I pray thee; please.",
    "forsooth":"In truth; indeed.",
    "anon":"Soon; shortly.",
    "betwixt":"Between.",
    "methinks":"It seems to me.",
    "perchance":"Perhaps.",
    "marry":"Indeed! (mild oath, from the Virgin Mary).",
    "sirrah":"Form of address to an inferior.",
    "withal":"With; in addition; moreover.",
    "aught":"Anything.",
    "naught":"Nothing.",
    "nay":"No.",
    "ay":"Yes.",
    "aye":"Yes; ever.",
    "fie":"Exclamation of disgust or disapproval.",
    "wilt":"Will (second person: 'thou wilt').",
    "shalt":"Shall (second person: 'thou shalt').",
    "dost":"Do (second person: 'thou dost').",
    "hast":"Have (second person: 'thou hast').",
    "wert":"Were (second person: 'thou wert').",
    "wouldst":"Would (second person: 'thou wouldst').",
    "shouldst":"Should (second person).",
    "mayhap":"Perhaps.",
    "'twas":"It was.",
    "'tis":"It is.",
    "o'er":"Over.",
    "ne'er":"Never.",
    "e'er":"Ever.",
    "oft":"Often.",
    "fain":"Gladly; willing.",
    "knave":"A dishonest or unscrupulous man; a male servant.",
    "varlet":"A rascal; an attendant.",
    "wench":"A girl or young woman.",
    "coz":"Cousin (term of familiar address).",
    "troth":"Truth, faith (as in 'by my troth').",
    "alack":"Alas; an exclamation of regret.",
    "lass":"A girl or young woman.",
    "lief":"Gladly; willingly ('I had as lief').",
    "mark":"Listen; pay attention to.",
    "morrow":"Morning ('good morrow').",
    "pox":"A curse (as in 'a pox upon it').",
    "rogue":"A dishonest or playfully mischievous person.",
    "sooth":"Truth.",
    "swain":"A young lover or suitor; a country youth.",
    "trow":"Believe; trust.",
    "verily":"Truly; certainly.",
    "villain":"Originally: a peasant; later: a scoundrel.",
    "visage":"Face; appearance.",
    "woe":"Grief; sorrow.",
    "yonder":"Over there; at a distance.",
    "zounds":"God's wounds (an oath).",
    "whence":"From where.",
    "abide":"To stay; to endure; to wait for.",
    "accost":"To approach and address.",
    "beseech":"To beg; to implore.",
    "beshrew":"A mild curse ('beshrew me').",
    "bestow":"To give; to place.",
    "entreat":"To ask earnestly; to plead.",
    "tarry":"To wait; to delay.",
  };
  return glossary[word] || null;
}

module.exports = r;
