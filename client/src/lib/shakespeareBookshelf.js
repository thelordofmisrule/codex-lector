const LOCAL_XML_IDS = new Set([
  "A68475",
  "A08649",
  "A09802",
  "A20800",
  "A08838",
  "A08840",
  "A06173",
  "A02143",
  "A02151",
  "A68197",
  "A68198",
  "A68202",
  "A02595",
  "A19821",
  "A03435",
  "A02750",
  "A04243",
  "A68653",
  "A06181",
  "A05206",
  "A04520",
  "A68278",
  "A10675",
  "A01997",
  "A01998",
]);

const SOURCE_RECORDS = [
  {
    id: "plautus-menaechmi",
    title: "Menaechmi",
    author: "Plautus",
    dateLabel: "Classical comedy",
    shelfType: "Classical text",
    description: "The most obvious double-twin source behind The Comedy of Errors.",
  },
  {
    id: "plautus-amphitruo",
    title: "Amphitruo",
    author: "Plautus",
    dateLabel: "Classical comedy",
    shelfType: "Classical text",
    description: "A second Plautine model for mistaken identity and servant-master confusion.",
  },
  {
    id: "warner-menaechmi",
    title: "Menaechmi",
    author: "William Warner, translating Plautus",
    dateLabel: "1595",
    shelfType: "English print",
    description: "Likely the English witness Shakespeare knew for the Menaechmi plot.",
  },
  {
    id: "gower-confessio-amantis",
    title: "Confessio Amantis",
    author: "John Gower",
    dateLabel: "1483 / 1532 printings",
    shelfType: "English print",
    tcpIds: ["A01997", "A01998"],
    description: "The Apollonius of Tyre story runs through it and returns again in Pericles.",
  },
  {
    id: "ariosto-i-suppositi",
    title: "I Suppositi",
    author: "Ludovico Ariosto",
    dateLabel: "1509",
    shelfType: "Italian play",
    description: "The Italian comedy behind Supposes and, through it, The Taming of the Shrew.",
  },
  {
    id: "gascoigne-supposes",
    title: "Supposes",
    author: "George Gascoigne, after Ariosto",
    dateLabel: "1566",
    shelfType: "English print",
    description: "The English dramatic intermediary most often linked to Shrew's induction and subplot machinery.",
  },
  {
    id: "taming-of-a-shrew",
    title: "The Taming of a Shrew",
    author: "Anonymous",
    dateLabel: "1594",
    shelfType: "Related play",
    description: "A debated relation: source, derivative, or sibling to Shakespeare's play.",
  },
  {
    id: "montemayor-diana",
    title: "Diana Enamorada",
    author: "Jorge de Montemayor",
    dateLabel: "1559",
    shelfType: "Spanish romance",
    description: "The romance source usually cited behind The Two Gentlemen of Verona.",
  },
  {
    id: "elyot-governor",
    title: "The Boke Named the Governour",
    author: "Thomas Elyot",
    dateLabel: "1531",
    shelfType: "English prose",
    description: "Often invoked for the play's friendship and courtesy ideals.",
  },
  {
    id: "boccaccio-decameron",
    title: "Decameron",
    author: "Giovanni Boccaccio",
    dateLabel: "14th century",
    shelfType: "Italian prose",
    description: "A recurring Italian narrative reservoir behind several Shakespeare plots.",
  },
  {
    id: "ovid-metamorphoses",
    title: "Metamorphoses",
    author: "Ovid",
    dateLabel: "Golding 1567; Latin also likely",
    shelfType: "Classical text / English print",
    tcpIds: ["A08649"],
    description: "One of Shakespeare's great storehouses: myth, transformation, and rhetorical texture across the canon.",
  },
  {
    id: "chaucer-knights-tale",
    title: "The Knight's Tale",
    author: "Geoffrey Chaucer",
    dateLabel: "Late 14th century",
    shelfType: "Middle English poem",
    description: "The Theseus-Hippolyta frame behind A Midsummer Night's Dream.",
  },
  {
    id: "apuleius-golden-ass",
    title: "The Golden Ass",
    author: "Apuleius; trans. William Adlington",
    dateLabel: "1566",
    shelfType: "English print",
    tcpIds: ["A20800"],
    description: "The ass-transformation tradition behind Bottom and Dream's comic metamorphosis.",
  },
  {
    id: "plutarch-lives",
    title: "Lives of the Noble Grecians and Romanes",
    author: "Plutarch; trans. Thomas North",
    dateLabel: "1579",
    shelfType: "English print",
    tcpIds: ["A09802"],
    description: "The governing source for the Roman plays and a major background book elsewhere.",
  },
  {
    id: "il-pecorone",
    title: "Il Pecorone",
    author: "Giovanni Fiorentino",
    dateLabel: "14th century",
    shelfType: "Italian prose",
    description: "The likely narrative source for Merchant of Venice and part of Merry Wives.",
  },
  {
    id: "gesta-romanorum",
    title: "Gesta Romanorum",
    author: "Anonymous",
    dateLabel: "Medieval collection",
    shelfType: "Story collection",
    description: "A probable route for Merchant of Venice's casket plot.",
  },
  {
    id: "jew-of-malta",
    title: "The Jew of Malta",
    author: "Christopher Marlowe",
    dateLabel: "c. 1589-1590",
    shelfType: "English play",
    description: "A dramatic near-contemporary that sits close to Merchant of Venice's theatrical world.",
  },
  {
    id: "orlando-furioso",
    title: "Orlando Furioso",
    author: "Ludovico Ariosto; trans. John Harington",
    dateLabel: "1591 translation",
    shelfType: "English print",
    description: "The Ariodante-Ginevra story sits behind Much Ado About Nothing.",
  },
  {
    id: "bandello-novelle",
    title: "Novelle",
    author: "Matteo Bandello",
    dateLabel: "16th century",
    shelfType: "Italian prose",
    description: "One of the central continental novella sources behind several plays.",
  },
  {
    id: "belleforest-histoires-tragiques",
    title: "Histoires Tragiques",
    author: "Francois de Belleforest",
    dateLabel: "16th century",
    shelfType: "French prose",
    description: "The French intermediary often bridging Bandello and Shakespeare.",
  },
  {
    id: "lodge-rosalynde",
    title: "Rosalynde",
    author: "Thomas Lodge",
    dateLabel: "1590 / 1592 printing",
    shelfType: "English print",
    tcpIds: ["A06173"],
    description: "The close narrative source for As You Like It.",
  },
  {
    id: "riche-farewell",
    title: "Riche His Farewell to Militarie Profession",
    author: "Barnabe Riche",
    dateLabel: "1581",
    shelfType: "English print",
    tcpIds: ["A68653"],
    description: "Contains 'Of Apollonius and Silla,' the best-known source for Twelfth Night.",
  },
  {
    id: "glingannati",
    title: "Gl'Ingannati",
    author: "Accademia degli Intronati",
    dateLabel: "1531",
    shelfType: "Italian play",
    description: "A deeper structural source for Twelfth Night's disguise plot.",
  },
  {
    id: "greene-pandosto",
    title: "Pandosto",
    author: "Robert Greene",
    dateLabel: "1588",
    shelfType: "English print",
    tcpIds: ["A02143", "A02151"],
    description: "The chief prose source for The Winter's Tale.",
  },
  {
    id: "montaigne-essays",
    title: "Essayes",
    author: "Michel de Montaigne; trans. John Florio",
    dateLabel: "1603 / 1613",
    shelfType: "English print",
    tcpIds: ["A68475"],
    description: "A late, pervasive prose presence, especially from The Tempest onward.",
  },
  {
    id: "virgil-aeneid",
    title: "Aeneid",
    author: "Virgil",
    dateLabel: "Classical epic",
    shelfType: "Classical text",
    description: "A recurrent classical pressure behind storm scenes, empire, and tragic grandeur.",
  },
  {
    id: "strachey-true-reportory",
    title: "A True Reportory of the Wracke",
    author: "William Strachey",
    dateLabel: "1609 manuscript circulation",
    shelfType: "Manuscript report",
    description: "The Bermuda shipwreck report usually linked to The Tempest's sea opening.",
  },
  {
    id: "holinshed-chronicles",
    title: "Holinshed's Chronicles",
    author: "Raphael Holinshed et al.",
    dateLabel: "1587",
    shelfType: "English print",
    tcpIds: ["A68197", "A68198", "A68202"],
    description: "The indispensable chronicle source for the histories and several tragedies.",
  },
  {
    id: "hall-union",
    title: "The Union of the Two Noble and Illustre Famelies of Lancastre and Yorke",
    author: "Edward Hall",
    dateLabel: "1548",
    shelfType: "English print",
    tcpIds: ["A02595"],
    description: "A Tudor chronicle shaping the Henry VI plays, Richard III, Henry V, and Henry VIII.",
  },
  {
    id: "more-richard-iii",
    title: "The History of King Richard III",
    author: "Thomas More",
    dateLabel: "16th century",
    shelfType: "English prose",
    description: "A key hostile portrait behind Shakespeare's Richard III.",
  },
  {
    id: "daniel-civil-wars",
    title: "The Civile Wars",
    author: "Samuel Daniel",
    dateLabel: "1595 / 1609",
    shelfType: "English print",
    tcpIds: ["A19821"],
    description: "Daniel's chronicle poem runs close to several Lancastrian and Ricardian plays.",
  },
  {
    id: "woodstock",
    title: "Woodstock",
    author: "Anonymous",
    dateLabel: "Late 16th century",
    shelfType: "Related play",
    description: "A debated dramatic precursor orbiting King Richard II.",
  },
  {
    id: "froissart-chronicles",
    title: "Chronicles",
    author: "Jean Froissart; trans. Lord Berners",
    dateLabel: "1523-1525 translation",
    shelfType: "English print",
    description: "An additional chronicle background for Richard II and the late medieval histories.",
  },
  {
    id: "troublesome-reign-king-john",
    title: "The Troublesome Raigne of John King of England",
    author: "Anonymous",
    dateLabel: "1591 / 1611",
    shelfType: "English print",
    tcpIds: ["A68278", "A04520"],
    description: "The clearest dramatic source for Shakespeare's King John.",
  },
  {
    id: "foxe-acts-monuments",
    title: "Acts and Monuments",
    author: "John Foxe",
    dateLabel: "1563 onward",
    shelfType: "English print",
    description: "The huge Protestant history behind King John and Henry VIII.",
  },
  {
    id: "famous-victories-henry-v",
    title: "The Famous Victories of Henry V",
    author: "Anonymous",
    dateLabel: "1580s / 1598 print",
    shelfType: "English play",
    description: "The old play standing behind Shakespeare's Henry IV and Henry V.",
  },
  {
    id: "stow-annals",
    title: "Annales of England",
    author: "John Stow",
    dateLabel: "1592 onward",
    shelfType: "English print",
    description: "An additional chronicle source for the Henriad.",
  },
  {
    id: "speed-history-great-britain",
    title: "History of Great Britaine",
    author: "John Speed",
    dateLabel: "1611",
    shelfType: "English print",
    description: "Sometimes brought into Henry VIII discussions if the play is late enough.",
  },
  {
    id: "seneca-thyestes",
    title: "Thyestes",
    author: "Seneca",
    dateLabel: "Classical tragedy",
    shelfType: "Classical text",
    description: "The revenge-banquet model behind Titus Andronicus.",
  },
  {
    id: "history-of-titus-andronicus",
    title: "History of Titus Andronicus",
    author: "Unknown / chapbook tradition",
    dateLabel: "Lost or nearly lost",
    shelfType: "Lost prose source",
    description: "Often posited as a lost prose witness behind Titus Andronicus.",
  },
  {
    id: "brooke-romeus-and-juliet",
    title: "The Tragicall Historye of Romeus and Juliet",
    author: "Arthur Brooke",
    dateLabel: "1562",
    shelfType: "English print",
    tcpIds: ["A03435"],
    description: "The primary narrative source for Romeo and Juliet.",
  },
  {
    id: "painter-palace-of-pleasure",
    title: "The Palace of Pleasure",
    author: "William Painter",
    dateLabel: "1566 / 1567",
    shelfType: "English print",
    tcpIds: ["A08838", "A08840"],
    description: "A major English story anthology that repeatedly mediates classical and continental material.",
  },
  {
    id: "appian-civil-wars",
    title: "Civil Wars",
    author: "Appian",
    dateLabel: "Classical history",
    shelfType: "Classical text",
    description: "A possible secondary Roman historical source for Julius Caesar.",
  },
  {
    id: "ur-hamlet",
    title: "The Ur-Hamlet",
    author: "Lost play, often linked to Thomas Kyd",
    dateLabel: "Lost",
    shelfType: "Lost play",
    description: "The missing dramatic intermediary shadowing Hamlet's revenge plot.",
  },
  {
    id: "saxo-grammaticus",
    title: "Gesta Danorum",
    author: "Saxo Grammaticus",
    dateLabel: "12th century",
    shelfType: "Latin chronicle",
    description: "The older Amleth material behind Belleforest and, indirectly, Hamlet.",
  },
  {
    id: "bright-treatise-of-melancholy",
    title: "A Treatise of Melancholy",
    author: "Timothy Bright",
    dateLabel: "1586",
    shelfType: "English print",
    description: "Frequently discussed as part of Hamlet's intellectual and affective background.",
  },
  {
    id: "cinthio-hecatommithi",
    title: "Hecatommithi",
    author: "Giambattista Giraldi Cinthio",
    dateLabel: "1565",
    shelfType: "Italian prose",
    description: "The indispensable tale behind Othello.",
  },
  {
    id: "pliny-natural-history",
    title: "The Historie of the World / Natural History tradition",
    author: "Pliny; trans. Philemon Holland",
    dateLabel: "1601",
    shelfType: "English print",
    description: "A likely source for Othello's travel lore and marvel discourse.",
  },
  {
    id: "king-leir",
    title: "The True Chronicle History of King Leir",
    author: "Anonymous",
    dateLabel: "1605",
    shelfType: "English print",
    tcpIds: ["A05206"],
    description: "The chief dramatic predecessor for King Lear's main plot.",
  },
  {
    id: "sidney-arcadia",
    title: "Arcadia",
    author: "Philip Sidney",
    dateLabel: "1590",
    shelfType: "English print",
    description: "The Gloucester subplot of King Lear comes out of Arcadia's Paphlagonian episode.",
  },
  {
    id: "spenser-faerie-queene",
    title: "The Faerie Queene",
    author: "Edmund Spenser",
    dateLabel: "1590 / 1596",
    shelfType: "English print",
    description: "A broad poetic and thematic pressure, with a specific Lear connection in Book 2, Canto 10.",
  },
  {
    id: "harsnett-impostures",
    title: "A Declaration of Egregious Popish Impostures",
    author: "Samuel Harsnett",
    dateLabel: "1603",
    shelfType: "English print",
    tcpIds: ["A02750"],
    description: "The vivid demonological language Edgar borrows in King Lear.",
  },
  {
    id: "buchanan-rerum-scoticarum",
    title: "Rerum Scoticarum Historia",
    author: "George Buchanan",
    dateLabel: "1582",
    shelfType: "Latin history",
    description: "A possible supplementary Scottish chronicle behind Macbeth.",
  },
  {
    id: "james-daemonologie",
    title: "Daemonologie",
    author: "King James VI and I",
    dateLabel: "1597",
    shelfType: "English print",
    tcpIds: ["A04243"],
    description: "The royal demonological text lurking behind Macbeth's witchcraft atmosphere.",
  },
  {
    id: "daniel-cleopatra",
    title: "The Tragedie of Cleopatra",
    author: "Samuel Daniel",
    dateLabel: "1594",
    shelfType: "English print",
    description: "A likely poetic companion text for Antony and Cleopatra.",
  },
  {
    id: "livy-history-of-rome",
    title: "Ab Urbe Condita / History of Rome",
    author: "Livy",
    dateLabel: "Classical history",
    shelfType: "Classical text",
    description: "The Roman historical skeleton behind Lucrece and possibly Coriolanus.",
  },
  {
    id: "camden-remains",
    title: "Remaines Concerning Britaine",
    author: "William Camden",
    dateLabel: "1605",
    shelfType: "English print",
    description: "Often cited for Coriolanus and the belly fable tradition.",
  },
  {
    id: "lucian-timon-misanthrope",
    title: "Timon the Misanthrope",
    author: "Lucian",
    dateLabel: "Classical dialogue",
    shelfType: "Classical text",
    description: "One of the classic Timon witnesses hovering behind Timon of Athens.",
  },
  {
    id: "twine-pattern-of-painful-adventures",
    title: "The Pattern of Painefull Adventures",
    author: "Laurence Twine",
    dateLabel: "c. 1576",
    shelfType: "English prose",
    description: "The English Apollonius narrative behind Pericles.",
  },
  {
    id: "rare-triumphs-love-fortune",
    title: "The Rare Triumphs of Love and Fortune",
    author: "Anonymous",
    dateLabel: "1589",
    shelfType: "English play",
    description: "Sometimes cited as a theatrical analogue for Cymbeline.",
  },
  {
    id: "lodge-scillaes-metamorphosis",
    title: "Scillaes Metamorphosis",
    author: "Thomas Lodge",
    dateLabel: "1589",
    shelfType: "English print",
    tcpIds: ["A06181"],
    description: "A useful nearby poem when thinking about Venus and Adonis.",
  },
  {
    id: "ovid-fasti",
    title: "Fasti",
    author: "Ovid",
    dateLabel: "Classical poem",
    shelfType: "Classical text",
    description: "The closest classical poem behind The Rape of Lucrece.",
  },
  {
    id: "chaucer-legend-good-women",
    title: "The Legend of Good Women",
    author: "Geoffrey Chaucer",
    dateLabel: "Late 14th century",
    shelfType: "Middle English poem",
    description: "A major English poetic precedent for Lucrece.",
  },
  {
    id: "sidney-astrophil-and-stella",
    title: "Astrophil and Stella",
    author: "Philip Sidney",
    dateLabel: "1591",
    shelfType: "English print",
    description: "One of the central English sonnet sequences shadowing Shakespeare's Sonnets.",
  },
  {
    id: "spenser-amoretti",
    title: "Amoretti",
    author: "Edmund Spenser",
    dateLabel: "1595",
    shelfType: "English print",
    description: "Part of the immediate English sonnet field around Shakespeare's Sonnets.",
  },
  {
    id: "daniel-delia",
    title: "Delia",
    author: "Samuel Daniel",
    dateLabel: "1592",
    shelfType: "English print",
    description: "Another immediate sonnet-sequence predecessor.",
  },
  {
    id: "petrarchan-sonnet-tradition",
    title: "The Petrarchan sonnet tradition",
    author: "Petrarch and successors",
    dateLabel: "Long 14th-16th century tradition",
    shelfType: "Poetic tradition",
    description: "The inherited rhetoric, sequence logic, and imagery Shakespeare inherits and resists in the Sonnets.",
  },
  {
    id: "geneva-bible",
    title: "The Geneva Bible",
    author: "English Protestant translators",
    dateLabel: "1560 / 1561",
    shelfType: "English print",
    tcpIds: ["A10675"],
    description: "A likely constant textual companion across the canon.",
  },
  {
    id: "bishops-bible",
    title: "The Bishops' Bible",
    author: "English bishops and translators",
    dateLabel: "1568 onward",
    shelfType: "English print",
    description: "Another Bible Shakespeare may have had in view beside the Geneva text.",
  },
  {
    id: "book-of-common-prayer",
    title: "Book of Common Prayer",
    author: "Church of England",
    dateLabel: "1559 onward",
    shelfType: "Liturgical book",
    description: "A recurring liturgical and verbal presence throughout the plays and poems.",
  },
  {
    id: "chaucer-corpus",
    title: "Chaucer across the canon",
    author: "Geoffrey Chaucer",
    dateLabel: "14th century",
    shelfType: "Poetic background",
    description: "A recurrent English poetic companion beyond any single source episode.",
  },
  {
    id: "spenser-corpus",
    title: "Spenser across the canon",
    author: "Edmund Spenser",
    dateLabel: "Late 16th century",
    shelfType: "Poetic background",
    description: "A sustained poetic presence, not just isolated source borrowing.",
  },
  {
    id: "sidney-corpus",
    title: "Sidney across the canon",
    author: "Philip Sidney",
    dateLabel: "Late 16th century",
    shelfType: "Poetic background",
    description: "A broader courtly and literary context extending past Arcadia or Astrophil and Stella alone.",
  },
];

export const BOOKSHELF_SOURCES = SOURCE_RECORDS.map((source) => ({
  ...source,
  tcpIds: source.tcpIds || [],
  localXml: (source.tcpIds || []).some((id) => LOCAL_XML_IDS.has(id)),
}));

const SOURCE_MAP = new Map(BOOKSHELF_SOURCES.map((source) => [source.id, source]));

const HENRY_VI_SOURCES = [
  { sourceId: "holinshed-chronicles", note: "The main chronicle narrative across the trilogy." },
  { sourceId: "hall-union", note: "A second chronicle pressure shaping dynastic framing and rhetoric." },
];

const HENRY_IV_SOURCES = [
  { sourceId: "holinshed-chronicles", note: "The principal historical narrative source." },
  { sourceId: "daniel-civil-wars", note: "A poetic chronicle companion for Ricardian and Lancastrian material." },
  { sourceId: "famous-victories-henry-v", note: "The older play whose tavern and prince material hover behind the Henriad." },
  { sourceId: "stow-annals", note: "A supplementary chronicle witness." },
];

export const BOOKSHELF_WORKS = [
  {
    slug: "comedy-of-errors",
    title: "The Comedy of Errors",
    category: "Comedies",
    summary: "Plautine twin confusion fused to an Apollonius-style family separation frame.",
    sources: [
      { sourceId: "plautus-menaechmi", note: "The primary engine of mistaken identity and separated twins." },
      { sourceId: "plautus-amphitruo", note: "Adds another Plautine layer of doubling and servant confusion." },
      { sourceId: "warner-menaechmi", note: "Likely the English print Shakespeare could have used directly." },
      { sourceId: "gower-confessio-amantis", note: "The Aegeon frame echoes Gower's Apollonius material." },
    ],
  },
  {
    slug: "taming-of-the-shrew",
    title: "The Taming of the Shrew",
    category: "Comedies",
    summary: "An English theatrical knot of Ariosto, Gascoigne, and the rival Shrew play.",
    sources: [
      { sourceId: "ariosto-i-suppositi", note: "The deeper Italian comedy source behind the subplot." },
      { sourceId: "gascoigne-supposes", note: "The likeliest English intermediary for subplot structure and tone." },
      { sourceId: "taming-of-a-shrew", note: "A debated relation that still belongs on the same shelf." },
    ],
  },
  {
    slug: "two-gentlemen-of-verona",
    title: "The Two Gentlemen of Verona",
    category: "Comedies",
    summary: "Romance plotting from Montemayor with English humanist ideas of friendship in the background.",
    sources: [
      { sourceId: "montemayor-diana", note: "The main romance source, probably by way of Yonge's Englishing or manuscript circulation." },
      { sourceId: "elyot-governor", note: "Useful background for the play's idealized friendship discourse." },
      { sourceId: "boccaccio-decameron", note: "A looser novella background often mentioned in discussions of the play's plotting." },
    ],
  },
  {
    slug: "midsummer-nights-dream",
    title: "A Midsummer Night's Dream",
    category: "Comedies",
    summary: "Ovidian metamorphosis layered with Chaucerian Theseus material and antique transformations.",
    sources: [
      { sourceId: "ovid-metamorphoses", note: "Pyramus and Thisbe and much of the play's imaginative air come from Ovid." },
      { sourceId: "chaucer-knights-tale", note: "Theseus, Hippolyta, and the Athenian courtly frame come through Chaucer." },
      { sourceId: "apuleius-golden-ass", note: "Bottom's ass-head belongs to this broader transformation tradition." },
      { sourceId: "plutarch-lives", note: "A possible classical supplement through the Life of Theseus." },
    ],
  },
  {
    slug: "merchant-of-venice",
    title: "The Merchant of Venice",
    category: "Comedies",
    summary: "Italian novella material, medieval exempla, and the shadow of a Marlovian Jewish villain.",
    sources: [
      { sourceId: "il-pecorone", note: "The likeliest source for the pound-of-flesh narrative." },
      { sourceId: "gesta-romanorum", note: "The casket trial likely belongs to this story tradition." },
      { sourceId: "jew-of-malta", note: "A theatrical neighbor rather than a narrative source, but still an essential comparison." },
    ],
  },
  {
    slug: "merry-wives-of-windsor",
    title: "The Merry Wives of Windsor",
    category: "Comedies",
    summary: "Domestic comic plotting drawing again on Fiorentino, with Ovidian hunter imagery in the Herne scene.",
    sources: [
      { sourceId: "il-pecorone", note: "Another likely Fiorentino source in the play's comic intrigue." },
      { sourceId: "ovid-metamorphoses", note: "Actaeon and hunter mythology haunt the Herne material." },
    ],
  },
  {
    slug: "much-ado-about-nothing",
    title: "Much Ado About Nothing",
    category: "Comedies",
    summary: "An Italian slander plot reframed as a dazzling comic war of wit.",
    sources: [
      { sourceId: "orlando-furioso", note: "The Ariodante-Ginevra story stands close behind Hero's shaming." },
      { sourceId: "bandello-novelle", note: "The Italian novella background behind the same plot family." },
      { sourceId: "belleforest-histoires-tragiques", note: "A likely French intermediary for the slander narrative." },
    ],
  },
  {
    slug: "as-you-like-it",
    title: "As You Like It",
    category: "Comedies",
    summary: "Lodge's pastoral romance reshaped into a more spacious comic forest world.",
    sources: [
      { sourceId: "lodge-rosalynde", note: "The primary and very close prose source." },
    ],
  },
  {
    slug: "twelfth-night",
    title: "Twelfth Night",
    category: "Comedies",
    summary: "Riche's separated twins meet Italian cross-dressing comedy and novella backstory.",
    sources: [
      { sourceId: "riche-farewell", note: "Contains 'Of Apollonius and Silla,' the closest narrative source." },
      { sourceId: "glingannati", note: "A deeper structural source for disguise, twins, and mistaken desire." },
      { sourceId: "bandello-novelle", note: "Part of the broader continental narrative ancestry behind the play." },
      { sourceId: "belleforest-histoires-tragiques", note: "The French route often invoked in that same ancestry." },
    ],
  },
  {
    slug: "winters-tale",
    title: "The Winter's Tale",
    category: "Comedies",
    summary: "Greene's prose tale transformed by Shakespeare into repentance, wonder, and recovery.",
    sources: [
      { sourceId: "greene-pandosto", note: "The primary prose source, closely followed and then radically redeemed." },
    ],
  },
  {
    slug: "tempest",
    title: "The Tempest",
    category: "Comedies",
    summary: "Montaigne, storm narratives, and antique magic gathered into Shakespeare's island farewell.",
    sources: [
      { sourceId: "montaigne-essays", note: "Gonzalo's commonwealth speech closely follows 'Of the Cannibals.'" },
      { sourceId: "virgil-aeneid", note: "Storm, exile, and imperial afterimages keep Virgil nearby." },
      { sourceId: "strachey-true-reportory", note: "The Sea Venture wreck offers a plausible contemporary trigger." },
      { sourceId: "ovid-metamorphoses", note: "Prospero's renunciation recalls Medea's invocations in Ovid." },
    ],
  },
  {
    slug: "henry-vi-part-i",
    title: "Henry VI, Part 1",
    category: "Histories",
    summary: "Chronicle history built from Holinshed and Hall.",
    sources: HENRY_VI_SOURCES,
  },
  {
    slug: "henry-vi-part-ii",
    title: "Henry VI, Part 2",
    category: "Histories",
    summary: "Chronicle civil war material from the same Tudor shelf of Hall and Holinshed.",
    sources: HENRY_VI_SOURCES,
  },
  {
    slug: "henry-vi-part-iii",
    title: "Henry VI, Part 3",
    category: "Histories",
    summary: "The Wars of the Roses continue through the same chronicle duet.",
    sources: HENRY_VI_SOURCES,
  },
  {
    slug: "richard-iii",
    title: "Richard III",
    category: "Histories",
    summary: "Chronicle material sharpened by More's hostile portrait of Richard.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The main narrative chronicle frame." },
      { sourceId: "hall-union", note: "A second chronicle voice shaping the Tudor politics of the play." },
      { sourceId: "more-richard-iii", note: "The most vivid prose portrait behind Richard's stage persona." },
    ],
  },
  {
    slug: "king-richard-ii",
    title: "King Richard II",
    category: "Histories",
    summary: "Chronicle deposition history refracted through Daniel and other late medieval witnesses.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The indispensable chronicle narrative." },
      { sourceId: "daniel-civil-wars", note: "Daniel's reflective chronicle poem sits close to the play's mood." },
      { sourceId: "woodstock", note: "A debated dramatic neighbor often discussed with Richard II." },
      { sourceId: "froissart-chronicles", note: "Another likely chronicle background for Richard's reign." },
    ],
  },
  {
    slug: "king-john",
    title: "King John",
    category: "Histories",
    summary: "An older play reworked against chronicle and Protestant history.",
    sources: [
      { sourceId: "troublesome-reign-king-john", note: "The primary dramatic source." },
      { sourceId: "holinshed-chronicles", note: "Chronicle supplementation and political framing." },
      { sourceId: "foxe-acts-monuments", note: "A strong Protestant historical pressure behind the play's imagination of John." },
    ],
  },
  {
    slug: "henry-iv-part-i",
    title: "Henry IV, Part 1",
    category: "Histories",
    summary: "Chronicle history meets the tavern and prince material of the older Henry V play.",
    sources: HENRY_IV_SOURCES,
  },
  {
    slug: "henry-iv-part-ii",
    title: "Henry IV, Part 2",
    category: "Histories",
    summary: "The same chronicle and old-play shelf, now darker and more exhausted.",
    sources: HENRY_IV_SOURCES,
  },
  {
    slug: "henry-v",
    title: "Henry V",
    category: "Histories",
    summary: "Holinshed and Hall reframed through the inherited theatrical memory of Famous Victories.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The principal chronicle witness." },
      { sourceId: "famous-victories-henry-v", note: "The old play remains in the bones of the prince's theatrical history." },
      { sourceId: "hall-union", note: "A key Tudor chronicle companion." },
    ],
  },
  {
    slug: "henry-viii",
    title: "Henry VIII",
    category: "Histories",
    summary: "Late chronicle pageantry assembled from history books and Protestant martyrology.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The main historical frame." },
      { sourceId: "foxe-acts-monuments", note: "Essential to the play's Protestant coloration." },
      { sourceId: "hall-union", note: "Another major chronicle witness." },
      { sourceId: "speed-history-great-britain", note: "Sometimes invoked if the play's final form is as late as 1611 or after." },
    ],
  },
  {
    slug: "titus-andronicus",
    title: "Titus Andronicus",
    category: "Tragedies",
    summary: "Ovidian mutilation and Senecan revenge folded into an extreme early tragedy.",
    sources: [
      { sourceId: "ovid-metamorphoses", note: "The Philomela story is practically staged inside the play." },
      { sourceId: "seneca-thyestes", note: "The revenge banquet belongs to Seneca's terrible kitchen." },
      { sourceId: "history-of-titus-andronicus", note: "A conjectured prose witness still worth flagging as part of the play's source mystery." },
    ],
  },
  {
    slug: "romeo-and-juliet",
    title: "Romeo and Juliet",
    category: "Tragedies",
    summary: "Brooke's long poem compressed into volatile dramatic speed, with Painter nearby.",
    sources: [
      { sourceId: "brooke-romeus-and-juliet", note: "The primary narrative source and still the essential companion text." },
      { sourceId: "painter-palace-of-pleasure", note: "Another English version of the same story family." },
    ],
  },
  {
    slug: "julius-caesar",
    title: "Julius Caesar",
    category: "Tragedies",
    summary: "North's Plutarch almost line by line, with Appian lingering behind some political texture.",
    sources: [
      { sourceId: "plutarch-lives", note: "The overwhelmingly dominant source for Caesar, Brutus, and Antony." },
      { sourceId: "appian-civil-wars", note: "A possible secondary Roman history source." },
    ],
  },
  {
    slug: "hamlet",
    title: "Hamlet",
    category: "Tragedies",
    summary: "Belleforest's revenge tale mediated by lost drama, melancholy discourse, and late Montaigne.",
    sources: [
      { sourceId: "belleforest-histoires-tragiques", note: "The main surviving prose source for the Amleth story." },
      { sourceId: "ur-hamlet", note: "The lost dramatic intermediary that almost certainly mattered." },
      { sourceId: "saxo-grammaticus", note: "The older northern history behind Belleforest." },
      { sourceId: "bright-treatise-of-melancholy", note: "A commonly cited backdrop for Hamlet's inwardness." },
      { sourceId: "montaigne-essays", note: "Verbal and conceptual parallels make Florio's Montaigne hard to ignore." },
    ],
  },
  {
    slug: "othello",
    title: "Othello",
    category: "Tragedies",
    summary: "Cinthio's novella, with travel lore and marvel writing near at hand.",
    sources: [
      { sourceId: "cinthio-hecatommithi", note: "The essential tale of the Moor of Venice." },
      { sourceId: "pliny-natural-history", note: "A likely source-field for Othello's stories of marvel and travel." },
    ],
  },
  {
    slug: "king-lear",
    title: "King Lear",
    category: "Tragedies",
    summary: "Chronicle king, old play, romance subplot, demonology, and late Montaigne all converge.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The historical frame for Lear's ancient British story." },
      { sourceId: "king-leir", note: "The clearest dramatic predecessor for the main plot." },
      { sourceId: "sidney-arcadia", note: "The Gloucester subplot comes from Sidney's Paphlagonian king episode." },
      { sourceId: "spenser-faerie-queene", note: "A poetic and thematic companion, especially in the old-British genealogy tradition." },
      { sourceId: "harsnett-impostures", note: "Edgar's demonological language is drawn directly from Harsnett." },
      { sourceId: "montaigne-essays", note: "Montaigne's skeptical prose sits close to Lear's late tragic thinking." },
    ],
  },
  {
    slug: "macbeth",
    title: "Macbeth",
    category: "Tragedies",
    summary: "Chronicle history darkened by Scottish historiography and Jacobean demonology.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The primary narrative source." },
      { sourceId: "buchanan-rerum-scoticarum", note: "A possible supplementary Scottish historical witness." },
      { sourceId: "james-daemonologie", note: "A likely ideological and atmospheric companion for the witches." },
    ],
  },
  {
    slug: "antony-and-cleopatra",
    title: "Antony and Cleopatra",
    category: "Tragedies",
    summary: "North's Antony turned into high tragedy, with Daniel's Cleopatra nearby.",
    sources: [
      { sourceId: "plutarch-lives", note: "North's Life of Antony is extraordinarily close to the play's verbal texture." },
      { sourceId: "daniel-cleopatra", note: "A probable poetic companion in the Cleopatra tradition." },
    ],
  },
  {
    slug: "coriolanus",
    title: "Coriolanus",
    category: "Tragedies",
    summary: "Plutarch again, with Roman history and civic anecdote around the edges.",
    sources: [
      { sourceId: "plutarch-lives", note: "The dominant source for the plot and much of the political language." },
      { sourceId: "livy-history-of-rome", note: "A possible secondary Roman history source." },
      { sourceId: "camden-remains", note: "Often cited for the belly-fable tradition." },
    ],
  },
  {
    slug: "timon-of-athens",
    title: "Timon of Athens",
    category: "Tragedies",
    summary: "Plutarchan biography meeting Lucianic satire and Painter's story-book culture.",
    sources: [
      { sourceId: "plutarch-lives", note: "Lives of Antony and Alcibiades feed the play's Timon material." },
      { sourceId: "lucian-timon-misanthrope", note: "The classical dialogue keeps the misanthrope tradition in view." },
      { sourceId: "painter-palace-of-pleasure", note: "Another likely English story intermediary." },
    ],
  },
  {
    slug: "pericles",
    title: "Pericles",
    category: "Romances and Late Plays",
    summary: "Apollonius returns through Gower and Twine's English prose.",
    sources: [
      { sourceId: "gower-confessio-amantis", note: "Gower not only supplies Apollonius but enters the play as chorus." },
      { sourceId: "twine-pattern-of-painful-adventures", note: "The likely English prose intermediary for the Apollonius story." },
    ],
  },
  {
    slug: "cymbeline",
    title: "Cymbeline",
    category: "Romances and Late Plays",
    summary: "Holinshed's Britain meets Boccaccian wager narrative and other theatrical analogues.",
    sources: [
      { sourceId: "holinshed-chronicles", note: "The British historical frame comes through Holinshed." },
      { sourceId: "boccaccio-decameron", note: "The wager story belongs to Decameron Day 2, Novella 9." },
      { sourceId: "rare-triumphs-love-fortune", note: "A possible theatrical parallel often mentioned with Cymbeline." },
    ],
  },
  {
    slug: "venus-and-adonis",
    title: "Venus and Adonis",
    category: "Poems",
    summary: "Ovid's Adonis story revoiced in a high-colored erotic narrative poem.",
    sources: [
      { sourceId: "ovid-metamorphoses", note: "Book 10 is the indispensable source." },
      { sourceId: "lodge-scillaes-metamorphosis", note: "A nearby English mythological poem worth keeping on the same shelf." },
    ],
  },
  {
    slug: "rape-of-lucrece",
    title: "The Rape of Lucrece",
    category: "Poems",
    summary: "Ovid and Livy are the skeleton; Chaucer and Painter help shape the English poem Shakespeare writes from them.",
    sources: [
      { sourceId: "ovid-fasti", note: "The closest classical poetic source and the one Shakespeare seems to follow most intimately." },
      { sourceId: "livy-history-of-rome", note: "The spare Roman historical skeleton of the story." },
      { sourceId: "chaucer-legend-good-women", note: "A crucial English poetic precedent for Lucrece as exemplary woman." },
      { sourceId: "painter-palace-of-pleasure", note: "A likely English prose intermediary that helps explain some details." },
    ],
  },
  {
    slug: "sonnets",
    title: "Sonnets",
    category: "Poems",
    summary: "Less one source-book than a whole sonnet shelf: Sidney, Spenser, Daniel, and the Petrarchan inheritance.",
    sources: [
      { sourceId: "sidney-astrophil-and-stella", note: "A foundational English sequence Shakespeare clearly knew." },
      { sourceId: "spenser-amoretti", note: "Part of the immediate English sonnet field around the Sonnets." },
      { sourceId: "daniel-delia", note: "Another central English sequence in the background." },
      { sourceId: "petrarchan-sonnet-tradition", note: "The broad inherited rhetoric Shakespeare keeps using, bending, and undoing." },
    ],
  },
];

export const BOOKSHELF_CATEGORY_ORDER = [
  "Comedies",
  "Histories",
  "Tragedies",
  "Romances and Late Plays",
  "Poems",
];

export const CROSSCUTTING_SOURCE_IDS = [
  "holinshed-chronicles",
  "plutarch-lives",
  "ovid-metamorphoses",
  "geneva-bible",
  "bishops-bible",
  "book-of-common-prayer",
  "montaigne-essays",
  "chaucer-corpus",
  "spenser-corpus",
  "sidney-corpus",
  "painter-palace-of-pleasure",
];

const WORK_MAP = new Map(BOOKSHELF_WORKS.map((entry) => [entry.slug, entry]));

function uniqueSourceIdsForWorks(entries) {
  const seen = new Set();
  (entries || []).forEach((entry) => {
    (entry.sources || []).forEach((item) => seen.add(item.sourceId));
  });
  return [...seen];
}

export const BOOKSHELF_SOURCE_COUNT = new Set([
  ...uniqueSourceIdsForWorks(BOOKSHELF_WORKS),
  ...CROSSCUTTING_SOURCE_IDS,
]).size;
export const BOOKSHELF_LOCAL_XML_COUNT = BOOKSHELF_SOURCES.filter((source) => source.localXml).length;

export function normalizeBookshelfWorkSlug(slug) {
  const rawSlug = String(slug || "").trim();
  if (!rawSlug) return "";
  if (WORK_MAP.has(rawSlug)) return rawSlug;
  if (rawSlug.startsWith("f1-")) {
    const stripped = rawSlug.slice(3);
    if (WORK_MAP.has(stripped)) return stripped;
  }
  return rawSlug;
}

export function getBookshelfEntryForWork(slug) {
  return WORK_MAP.get(normalizeBookshelfWorkSlug(slug)) || null;
}

export function hasBookshelfForWork(slug) {
  return !!getBookshelfEntryForWork(slug);
}

export function getBookshelfSourcesForWork(slug) {
  const entry = getBookshelfEntryForWork(slug);
  if (!entry) return [];
  return entry.sources
    .map((item) => ({ ...item, source: SOURCE_MAP.get(item.sourceId) || null }))
    .filter((item) => item.source);
}

export function getBookshelfWorksByCategory() {
  return BOOKSHELF_CATEGORY_ORDER.map((category) => ({
    category,
    works: BOOKSHELF_WORKS.filter((entry) => entry.category === category),
  })).filter((group) => group.works.length > 0);
}

export function getCrosscuttingBookshelfSources() {
  return CROSSCUTTING_SOURCE_IDS
    .map((id) => SOURCE_MAP.get(id))
    .filter(Boolean);
}

export function getBookshelfSourceById(sourceId) {
  return SOURCE_MAP.get(String(sourceId || "").trim()) || null;
}

export function getBookshelfWorksForSource(sourceId) {
  const rawSourceId = String(sourceId || "").trim();
  if (!rawSourceId) return [];
  return BOOKSHELF_WORKS.filter((entry) => (entry.sources || []).some((item) => item.sourceId === rawSourceId));
}
