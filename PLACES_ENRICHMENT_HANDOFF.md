# Codex Lector Places Enrichment Handoff

Use this spec when preparing place updates with another LLM.

## 1) Target table (reference)

`places` columns used by the app:

- `slug` (`TEXT`, unique, required) - canonical id, lowercase kebab-case.
- `name` (`TEXT`, required) - display name.
- `modern_name` (`TEXT`) - modern form.
- `place_type` (`TEXT`) - lowercase type (`city`, `region`, `river`, `battlefield`, `street`, `site`, etc.).
- `modern_country` (`TEXT`) - modern country/region label.
- `lat` (`REAL`, nullable)
- `lng` (`REAL`, nullable)
- `description` (`TEXT`)
- `historical_note` (`TEXT`)
- `image_url` (`TEXT`)
- `aliases_json` (`TEXT`, JSON array of strings)
- `is_real` (`BOOLEAN` as `0/1`)
- `source_plays_json` (`TEXT`, JSON array of strings)

Related moderation/support tables exist (`place_edit_suggestions`, `place_create_suggestions`, `place_citation_exclusions`) but should **not** be edited directly by the external LLM.

## 2) Required handoff file format

Provide a JSON array of objects:

```json
[
  {
    "slug": "flushing",
    "name": "Flushing",
    "modernName": "Vlissingen",
    "placeType": "port",
    "modernCountry": "Netherlands",
    "lat": 51.4426,
    "lng": 3.5736,
    "description": "A Dutch port on the Scheldt estuary.",
    "historicalNote": "In Shakespeare's day, Flushing had strong military significance.",
    "imageUrl": "https://example.org/flushing.jpg",
    "aliases": ["Vlissingen"],
    "sourcePlays": ["Henry V"],
    "isReal": true,
    "citationExclusions": [
      {
        "workSlug": "alls-well-that-ends-well-f1",
        "lineNumber": 123,
        "lineText": "..."
      }
    ]
  }
]
```

Notes:

- `slug` is strongly preferred. If omitted, it will be inferred from `name`.
- Any omitted field is left as-is in DB.
- `aliases` and `sourcePlays` are merged with existing values (deduped).
- `lat`/`lng` can be a number or `null`.
- `isReal` can be `true/false` (also accepts `1/0`, `yes/no`, `true/false` strings).
- `citationExclusions` is optional and admin-only support data.

## 3) Content rules for the other LLM

- Keep `placeType` lowercase and consistent.
- Keep `description` concise factual summary.
- Keep `historicalNote` focused on Shakespeare-period context.
- Use real-world coordinates where applicable.
- Use empty array (or omit) instead of placeholder strings.
- Do not invent fake URLs; omit `imageUrl` if unknown.
