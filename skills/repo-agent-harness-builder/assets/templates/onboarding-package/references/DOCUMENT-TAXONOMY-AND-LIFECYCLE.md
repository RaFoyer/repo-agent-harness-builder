# Document Taxonomy And Lifecycle

Use this when the harness manages policy docs, client docs, personal files, research notes, receipts, screenshots, drafts, or operational records.

## Folder Classes

A practical default taxonomy:

```text
00_Index
10_Source_Material
20_Working_Drafts
30_Reviewed_Artifacts
40_Shared_or_Delivered
90_Archive
```

For personal folders, map these classes to lightweight labels instead of forcing a folder rebuild.

## Document Lifecycle

| Stage | Meaning |
| --- | --- |
| intake | newly found, not classified |
| source | original material that should stay unchanged |
| working | draft or active work |
| reviewed | checked and ready for reuse |
| delivered | shared externally or final for its purpose |
| archived | retained but not active |
| quarantine | isolated pending deletion or restoration |

## Metadata To Track

Track only what is useful:

- title or filename
- location
- document kind
- project or topic
- lifecycle stage
- owner, if relevant
- last modified date
- sensitivity tier
- authority location, such as repo, Drive, SharePoint, email, or database
- next action

## Naming Pattern

Use a pattern only when it helps retrieval:

```text
YYYY-MM-DD topic kind optional-detail.ext
```

Do not rename personal files automatically. Produce a mapping first:

```text
old path -> proposed path -> reason -> risk -> undo path
```

## Agent Instructions

When classifying documents:

- preserve originals
- avoid content inspection unless approved
- prefer metadata and folder context first
- separate source material from generated summaries
- keep role-restricted content in the external system that enforces access
- mark uncertain classifications instead of guessing
- keep a report the human can skim
