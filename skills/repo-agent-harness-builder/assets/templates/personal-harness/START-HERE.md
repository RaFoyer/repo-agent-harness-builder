# Start Here

This is a personal file-steward harness. It helps an agent inspect, classify, and propose safer organization for ordinary folders such as Downloads, Desktop, and Documents.

Nothing should move, rename, delete, upload, or share files until you approve a written plan.

Metadata-only still includes filenames, folders, sizes, and modified dates.
Treat inventory reports as private local artifacts unless you explicitly choose
to share them.

This harness starts with no managed folders. Add exact folders to
`config/scopes.json`, set `scopeConfirmed` only after approval, and run
`./{{CLI_NAME}} preflight` before any inventory scan.

Recommended install location:

```text
~/Documents/Home Harness
```

Ask the agent:

```text
Use this folder as my personal file-steward harness. Start read-only. Ask me which folders I want managed, which areas are off-limits, and how cautious I want cleanup plans to be.
```

First questions the agent should ask:

1. Which folders should be managed?
2. Which folders are off-limits and should be added to `excludedPaths` so inventory skips them?
3. Should the first scan collect metadata only, or also inspect document text?
4. Do you want organization suggestions only, duplicate candidates, naming cleanup, or scheduled check-ins?
5. How often, if ever, should an automation remind you to review new reports?
