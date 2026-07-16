# Implementation Goal Chain

## Purpose

This document defines a strictly sequential implementation path. If any goals can safely run in parallel, use `goal-graph-template.md` instead.

## Goal Thread Rule

Each goal finishes only after:

- PR is merged into <integration branch>
- linked issue/PR evidence exists
- local verification evidence is recorded
- orchestration ledger or handoff note is updated
- next goal is queued from current <integration branch>

## Integration Branch

<branch or branch policy>

## Canonical Tracker

<tracker, epic, project board, or issue list>

## Goal 1: <Title>

Objective:

Issues:

Scope:

Non-goals:

Exit criteria:

Verification:

Sequencing:

Next goal:

## Goal 2: <Title>

Objective:

Issues:

Scope:

Non-goals:

Exit criteria:

Verification:

Sequencing:

Next goal:
