/**
 * Approximate composition years for the canon and apocrypha, keyed by work slug.
 * Dates follow general scholarly consensus (Oxford/Wells & Taylor era ranges,
 * collapsed to a single representative year for charting). First Folio texts
 * are reprints and intentionally have no entry here.
 */
const COMPOSITION_YEARS = {
  // Comedies
  "two-gentlemen-of-verona": 1591,
  "taming-of-the-shrew": 1592,
  "comedy-of-errors": 1594,
  "loves-labours-lost": 1595,
  "midsummer-nights-dream": 1595,
  "merchant-of-venice": 1596,
  "merry-wives-of-windsor": 1597,
  "much-ado-about-nothing": 1598,
  "as-you-like-it": 1599,
  "twelfth-night": 1601,
  "measure-for-measure": 1604,
  "alls-well-that-ends-well": 1605,
  "pericles": 1607,
  "cymbeline": 1610,
  "winters-tale": 1610,
  "tempest": 1611,
  "two-noble-kinsmen": 1613,

  // Histories
  "henry-vi-part-ii": 1591,
  "henry-vi-part-iii": 1591,
  "henry-vi-part-i": 1592,
  "richard-iii": 1593,
  "king-richard-ii": 1595,
  "king-john": 1596,
  "henry-iv-part-i": 1597,
  "henry-iv-part-ii": 1598,
  "henry-v": 1599,
  "henry-viii": 1613,

  // Tragedies
  "titus-andronicus": 1592,
  "romeo-and-juliet": 1595,
  "julius-caesar": 1599,
  "hamlet": 1600,
  "sir-thomas-more": 1600,
  "troilus-and-cressida": 1602,
  "othello": 1604,
  "king-lear": 1605,
  "macbeth": 1606,
  "antony-and-cleopatra": 1606,
  "timon-of-athens": 1606,
  "coriolanus": 1608,

  // Poems
  "venus-and-adonis": 1593,
  "rape-of-lucrece": 1594,
  "shall-i-die": 1595,
  "passionate-pilgrim": 1599,
  "to-the-queen": 1599,
  "phoenix-turtle": 1601,
  "sonnets": 1609,
  "lovers-complaint": 1609,

  // Apocrypha (rough consensus datings)
  "apo-spanish-tragedy": 1587,
  "apo-troublesome-king-john": 1589,
  "apo-fair-em": 1590,
  "apo-mucedorus": 1590,
  "apo-edmund-ironside": 1590,
  "apo-arden-of-faversham": 1590,
  "apo-locrine": 1591,
  "apo-thomas-of-woodstock": 1592,
  "apo-edward-iii": 1593,
  "apo-shall-i-die": 1595,
  "apo-sir-john-oldcastle": 1599,
  "apo-thomas-lord-cromwell": 1600,
  "apo-merry-devil-of-edmonton": 1602,
  "apo-sejanus": 1603,
  "apo-london-prodigal": 1604,
  "apo-yorkshire-tragedy": 1605,
  "apo-puritan": 1606,
  "apo-second-maiden": 1611,
  "apo-a-funeral-elegy": 1612,
  "apo-birth-of-merlin": 1622,
  "apo-double-falsehood": 1727,
};

function compositionYear(slug) {
  return COMPOSITION_YEARS[slug] || null;
}

module.exports = { compositionYear };
