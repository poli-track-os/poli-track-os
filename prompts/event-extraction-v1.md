# Event extraction prompt — version 1

You are extracting structured political events from a single short text
(typically a tweet or news headline). The text is from or about a tracked
European politician. Your output is JSON in the structured-output schema
documented below. Be conservative: emit a row only when the text clearly
asserts something extractable. When in doubt, skip.

## Input shape

```
You are given:
- politician_name: full name of the tracked politician
- politician_role: their role (e.g. "Member of European Parliament")
- politician_country: their country
- text: the body of the tweet or headline
- text_posted_at: ISO date the text was posted, if known
```

## Output schema

```jsonschema
{
  "type": "object",
  "properties": {
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "event_type": {
            "type": "string",
            "enum": [
              "vote", "speech", "committee_join", "committee_leave",
              "election", "appointment", "resignation", "scandal",
              "policy_change", "party_switch", "legislation_sponsored",
              "foreign_meeting", "lobbying_meeting", "corporate_event",
              "financial_disclosure", "social_media", "travel",
              "donation_received", "public_statement", "court_case",
              "media_appearance"
            ]
          },
          "summary": { "type": "string", "maxLength": 200 },
          "claimed_at": { "type": "string", "format": "date-time" },
          "monetary_amount_eur": { "type": ["number", "null"] },
          "location": { "type": ["string", "null"] },
          "entities_mentioned": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Names or organisations mentioned. Use Wikidata QIDs when known."
          },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        },
        "required": ["event_type", "summary", "confidence"]
      }
    }
  },
  "required": ["events"]
}
```

## Rules

1. **Skip rule**: if the text doesn't obviously describe an event involving
   the named politician, return `{"events": []}`. Don't invent events from
   commentary, opinion, or general policy mentions.
2. **Confidence floor**: do not emit events with confidence < 0.5.
3. **No future events**: if the text describes a planned future event
   ("will meet next week"), set `claimed_at` to the planned date but use
   `event_type: "public_statement"` because we only know the announcement,
   not whether it happened.
4. **Money**: only set `monetary_amount_eur` when the text contains an
   explicit currency amount AND the politician is the subject of the
   transaction.
5. **Locations**: set `location` only when explicit ("Brussels", "Paris"),
   not when implied by context.
6. **One politician per call**: do not extract events about OTHER
   politicians from the same text — skip them. The caller will run the
   prompt separately for each politician of interest.

## Examples

### Example 1 — clear vote

Input:
```
politician_name: Jane Example
politician_role: Member of European Parliament
politician_country: Germany
text: Just voted YES on the Digital Services Act. Big day for digital rights in the EU.
text_posted_at: 2022-07-05T14:30:00Z
```

Output:
```json
{
  "events": [{
    "event_type": "vote",
    "summary": "Voted YES on the Digital Services Act",
    "claimed_at": "2022-07-05T14:30:00Z",
    "monetary_amount_eur": null,
    "location": null,
    "entities_mentioned": ["Digital Services Act"],
    "confidence": 0.95
  }]
}
```

### Example 2 — meeting

Input:
```
politician_name: Jane Example
politician_role: Member of European Parliament
politician_country: Germany
text: Productive meeting with @MicrosoftEU on AI Act implementation. Key questions remain on enforcement.
text_posted_at: 2024-03-15T11:00:00Z
```

Output:
```json
{
  "events": [{
    "event_type": "lobbying_meeting",
    "summary": "Met with Microsoft EU on AI Act implementation",
    "claimed_at": "2024-03-15T11:00:00Z",
    "monetary_amount_eur": null,
    "location": null,
    "entities_mentioned": ["Microsoft EU", "AI Act"],
    "confidence": 0.85
  }]
}
```

### Example 3 — opinion (skip)

Input:
```
text: The new energy policy is a disaster for working families.
```

Output:
```json
{ "events": [] }
```

## Versioning

- v1 (2026-04-15): initial template. Hash of this file is recorded with
  every extracted row in `claims.extraction_prompt_hash`. Bump to v2 when
  changing the schema or rules.
