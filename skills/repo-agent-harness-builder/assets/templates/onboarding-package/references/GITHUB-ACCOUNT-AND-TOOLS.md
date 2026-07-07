# GitHub Account And Tools

Use this only when repository mode needs GitHub access.

## Human-Friendly Setup

Explain GitHub as the project storage and review site. The human usually only needs to decide:

- which account to use
- whether to accept an invite
- whether the agent may download a working copy
- whether the agent may open a review request

## Agent Checklist

Check:

- git is installed
- GitHub CLI is installed, if the workflow uses it
- no-mistakes is installed, if the workflow uses the branch-to-PR validation gate
- the human is signed in, if required
- the repository can be read
- the target folder exists or can be created
- no credentials are pasted into chat

## Commands

Use only when appropriate for the local environment:

```bash
git --version
gh --version
gh auth status
git clone <repo-url>
no-mistakes --version
```

## Boundaries

Ask before:

- creating a repository
- changing repository settings
- adding collaborators
- pushing code
- creating releases
- initializing or changing the no-mistakes validation remote
- connecting deploy keys, apps, or external integrations
