export function editionLabelFromVariant(variant, category = "", slug = "") {
  const rawVariant = String(variant || "").trim();
  const rawCategory = String(category || "").trim();
  const rawSlug = String(slug || "").trim();

  if (rawVariant === "first-folio" || rawCategory === "first_folio" || rawSlug.startsWith("f1-")) return "First Folio";
  if (rawVariant === "ps-apocrypha" || rawCategory === "apocrypha" || rawSlug.startsWith("apo-")) return "Apocrypha";
  if (rawVariant === "ps" || rawVariant === "ps-poems") return "Modern";
  return rawVariant || "Edition";
}

export function getWorkEditionLabel(work) {
  return work?.editionLabel || editionLabelFromVariant(work?.variant, work?.category, work?.slug);
}

export function getWorkEditionOptionLabel(work) {
  if (!work) return "";
  return work.selectorLabel || `${work.title} — ${getWorkEditionLabel(work)}`;
}

export function getWorkFamilyTitle(work) {
  return work?.familyTitle || work?.title || "";
}

export function isPrimaryWorkEdition(work) {
  if (!work) return false;
  if (typeof work.isPrimaryEdition === "boolean") return work.isPrimaryEdition;
  return !work.familySlug || work.familySlug === work.slug;
}

export function buildPrimaryWorkOptions(works, filterFn = null) {
  const seen = new Set();
  return (works || [])
    .filter((work) => (filterFn ? filterFn(work) : true))
    .filter((work) => {
      const familyKey = work?.familySlug || work?.slug;
      if (!familyKey || seen.has(familyKey)) return false;
      if (!isPrimaryWorkEdition(work)) return false;
      seen.add(familyKey);
      return true;
    })
    .sort((left, right) => getWorkFamilyTitle(left).localeCompare(getWorkFamilyTitle(right)));
}
