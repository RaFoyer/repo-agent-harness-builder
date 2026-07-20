# Project Orchestration Ledger

`ops/orchestration.json` is authoritative. This file is an optional human-readable portfolio view.

## Project Control Plane

Prefix:

Scope ID and kind:

Scope objective:

Registry:

Boss task ID:

Boss trust level:

Last reconciled:

Coordination mode:

Project owner reference:

## Portfolio

| Node | Role | Work ref | Work kind | Governing protocols | Title | Task ID | Parent task ID | State | Trust | Completion profile | Next control action | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| boss | Boss | portfolio | governance | AGENT-ORCHESTRATION | `<PREFIX> - Boss` | <task ID> | none | working | T1 | custom | <next action> | <evidence> |

## Escalations

- <node>: <owner, exact decision or unblock action, and next check>

## Owner Directives

| Directive | Target node | Directive reference | Contract impact | Status | Target acknowledgement | Target resolution | Immediate-parent reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <directive id> | <node id> | <task/tracker reference> | within-contract or replan-required | issued/acknowledged/reconciled/superseded/cancelled | <target node, timestamp, evidence or pending> | <target node, timestamp, evidence or pending> | <immediate parent, timestamp, evidence or pending> |

## Trust Changes

- <date>: <node> <old level> -> <new level>; approver: <owner>; evidence: <references>

## Fan-In Queue

1. <node, parent, completion profile, required evidence>
