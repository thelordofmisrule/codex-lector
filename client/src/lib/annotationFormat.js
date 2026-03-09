export const preservedAnnotationTextStyle = {
  whiteSpace: "pre-wrap",
};

export function quotedText(text) {
  const value = String(text || "");
  return value ? `\u201C${value}\u201D` : "";
}

export function quotedExcerpt(text, limit = 80) {
  const value = String(text || "");
  if (!value) return "";
  const clipped = value.slice(0, limit);
  return `\u201C${clipped}${value.length > limit ? "\u2026" : ""}\u201D`;
}
