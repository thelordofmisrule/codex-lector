export const ANNOTATION_KINDS = [
  {
    id: "language",
    color: 0,
    label: "Language",
    desc: "Passage-specific wording or phrase note",
    cls: "hl-0",
    icon: "📘",
    accent: "var(--gold-light)",
  },
  {
    id: "rhetoric",
    color: 1,
    label: "Rhetoric",
    desc: "Rhetorical or poetic device",
    cls: "hl-1",
    icon: "🎭",
    accent: "var(--accent)",
  },
  {
    id: "note",
    color: 2,
    label: "Note",
    desc: "Interpretive or analytical note",
    cls: "hl-2",
    icon: "✍️",
    accent: "var(--success)",
  },
  {
    id: "context",
    color: 3,
    label: "Context",
    desc: "Historical or cultural context",
    cls: "hl-3",
    icon: "🏛",
    accent: "#7B6FAD",
  },
];

export const DEFAULT_ANNOTATION_COLOR = 2;

export function getAnnotationKind(color) {
  return ANNOTATION_KINDS.find((kind) => kind.color === Number(color)) || ANNOTATION_KINDS[DEFAULT_ANNOTATION_COLOR] || ANNOTATION_KINDS[0];
}
