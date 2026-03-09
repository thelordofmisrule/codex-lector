export const preservedAnnotationTextStyle = {
  whiteSpace: "pre-wrap",
};

function isWordChar(char) {
  return /[A-Za-z0-9]/.test(char || "");
}

function isOpeningContext(char) {
  return !char || /[\s([{<\u2014-]/.test(char);
}

export function smartenAnnotationText(text) {
  const value = String(text || "");
  let result = "";

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = value[i - 1] || "";
    const next = value[i + 1] || "";

    if (char === '"') {
      result += isOpeningContext(prev) ? "\u201C" : "\u201D";
      continue;
    }

    if (char === "'") {
      if (isWordChar(prev) && isWordChar(next)) {
        result += "\u2019";
      } else {
        result += isOpeningContext(prev) ? "\u2018" : "\u2019";
      }
      continue;
    }

    result += char;
  }

  return result;
}

export function quotedText(text) {
  const value = smartenAnnotationText(text);
  return value ? `\u201C${value}\u201D` : "";
}

export function quotedExcerpt(text, limit = 80) {
  const value = smartenAnnotationText(text);
  if (!value) return "";
  const clipped = value.slice(0, limit);
  return `\u201C${clipped}${value.length > limit ? "\u2026" : ""}\u201D`;
}
