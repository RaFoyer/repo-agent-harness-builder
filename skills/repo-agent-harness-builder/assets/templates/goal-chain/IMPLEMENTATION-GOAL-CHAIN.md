# Implementation Goal Chain

## Purpose

This document defines the implementation sequence, goal boundaries, verification expectations, and handoff rules.

## Goal Thread Rule

Each goal finishes only after:

- PR is merged into <integration branch>
- merge or squash integration commit is recorded in `Merge commit`, reachable from <integration branch>, and matches the recorded PR number
- linked issue/PR evidence exists
- local verification evidence is recorded
- next goal is queued from current <integration branch>, or the final goal says `Next goal: none`

## Goal 1: <Title>

Objective:
<one sentence>

Issues:
- #<issue>: <title>

Scope:
- <in scope>

Out of scope:
- <non-goal>

Exit criteria:
- <observable result>

Verification:
- <command or manual QA path>

Sequencing:
- <dependency, parallel allowance, or none>

## Goal 2: <Title>

Objective:
<one sentence>

Issues:
- #<issue>: <title>

Scope:
- <in scope>

Out of scope:
- <non-goal>

Exit criteria:
- <observable result>

Verification:
- <command or manual QA path>

Sequencing:
- Starts after Goal 1 merge or squash integration commit is visible from <integration branch> and matches the recorded PR.

Next goal:
- <Goal 3: title, or `none` if this is the final goal>
