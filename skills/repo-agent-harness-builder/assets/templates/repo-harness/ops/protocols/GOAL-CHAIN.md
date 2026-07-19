---
protocol_id: GOAL-CHAIN
title: Goal Chain Compatibility Alias
status: deprecated
version: 0.3.0
owner: repo-maintainers
last_reviewed: YYYY-MM-DD
summary: Routes legacy goal-chain references to the Goal Graph Loop; a chain is a linear graph topology.
related_protocols:
  - GOAL-GRAPH
  - AGENT-ORCHESTRATION
---

# Goal Chain Compatibility Alias

Use `GOAL-GRAPH.md` as the authoritative repository-merge control-loop
protocol. Existing goal-chain documents remain valid as linear goal graphs, and
the `goals` CLI continues to discover their legacy paths during migration.

Do not create a second role, lifecycle, authority model, or loop here. Update
new registry nodes to govern work with `AGENT-ORCHESTRATION` and `GOAL-GRAPH`,
and use `$goal-graph-loop` for Manager-owned execution.
