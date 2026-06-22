# Examples

These commands are maintainer and agent examples. Replace placeholder paths,
names, and slugs before running them; nontechnical recipients should ask an
agent to adapt the command rather than copying it exactly.

Build the reference archive:

```bash
python3 ../skills/repo-agent-harness-builder/scripts/build_reference_package.py --out-dir ../outputs
```

Scaffold a repository harness:

```bash
python3 ../skills/repo-agent-harness-builder/scripts/scaffold_harness.py \
  --target /path/to/project \
  --project-name "Example Project" \
  --repo-slug "example/project" \
  --cli-name harness \
  --allow-non-git
```

Scaffold a personal-folder harness:

```bash
python3 ../skills/repo-agent-harness-builder/scripts/scaffold_personal_harness.py \
  --target "$HOME/Documents/Home Harness" \
  --project-name "Home Harness" \
  --cli-name homeh
```
