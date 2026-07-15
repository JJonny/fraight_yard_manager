---
description: Generate a concise commit message from current changes
---

Analyze the current git changes and generate a short, concise commit message in English.

Steps:
1. Run `git diff --cached` to check staged changes. If nothing is staged, run `git diff` for unstaged changes.
2. If there are no changes at all, tell the user there's nothing to commit.
3. Analyze the diff: what files changed, what was added/removed/modified.
4. Determine the change type:
   - `feat:` — new feature or functionality
   - `fix:` — bug fix or correction
   - `doc:` — documentation only
   - `refactor:` — code restructuring without behavior change
   - `chore:` — tooling, config, dependencies, CI
5. Write a single-line commit message (max 72 chars) with the prefix. Use imperative mood ("add", not "added"). Be specific but terse.

Output ONLY the commit message text, nothing else. The user will copy it for `git commit -m`.
