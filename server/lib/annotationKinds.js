const ANNOTATION_KINDS = [
  { id: "language", color: 0 },
  { id: "rhetoric", color: 1 },
  { id: "note", color: 2 },
  { id: "context", color: 3 },
];

const DEFAULT_ANNOTATION_KIND = "note";

function getAnnotationKind(value, legacyColor = null) {
  const kindId = typeof value === "string" && Number.isNaN(Number(value)) ? value.trim().toLowerCase() : "";
  if (kindId) {
    return ANNOTATION_KINDS.find((kind) => kind.id === kindId)
      || ANNOTATION_KINDS.find((kind) => kind.color === Number(legacyColor))
      || ANNOTATION_KINDS.find((kind) => kind.id === DEFAULT_ANNOTATION_KIND)
      || ANNOTATION_KINDS[0];
  }

  return ANNOTATION_KINDS.find((kind) => kind.color === Number(value))
    || ANNOTATION_KINDS.find((kind) => kind.color === Number(legacyColor))
    || ANNOTATION_KINDS.find((kind) => kind.id === DEFAULT_ANNOTATION_KIND)
    || ANNOTATION_KINDS[0];
}

function getAnnotationKindId(value, legacyColor = null) {
  return getAnnotationKind(value, legacyColor).id;
}

function getAnnotationColor(value, legacyColor = null) {
  return getAnnotationKind(value, legacyColor).color;
}

module.exports = {
  ANNOTATION_KINDS,
  DEFAULT_ANNOTATION_KIND,
  getAnnotationKind,
  getAnnotationKindId,
  getAnnotationColor,
};
