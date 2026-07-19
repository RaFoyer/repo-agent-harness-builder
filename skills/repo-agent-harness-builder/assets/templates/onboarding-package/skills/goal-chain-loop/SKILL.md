---
name: goal-chain-loop
description: Deprecated compatibility alias for goal-graph-loop. Use only when an existing prompt or harness still names goal-chain-loop; route all new and active work to the Manager-owned goal graph workflow.
---

# Goal Chain Loop Compatibility Alias

This skill name is retained for one migration release. Load `$goal-graph-loop`
and follow it as the authoritative workflow. A goal chain is simply a goal
graph whose nodes form one linear path; it does not need its own role,
lifecycle, authority model, or control loop.

Do not copy this compatibility skill into new launch contracts. If a repository
still emits `goal-chain-loop`, update its harness and generated skill set, then
replace that requirement with `goal-graph-loop`.
