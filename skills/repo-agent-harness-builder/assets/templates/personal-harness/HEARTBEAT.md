# Heartbeat

Default: no standing heartbeat task.

Use this file only when the user has approved a recurring check-in for this personal harness.

Safe heartbeat examples:

- Check whether a long-running inventory finished.
- Remind the user to review a cleanup plan.
- Create a read-only weekly summary of Downloads growth.

Unsafe heartbeat examples:

- Move files without approval.
- Delete or purge files.
- Upload documents.
- Read sensitive document contents without a named scope.
