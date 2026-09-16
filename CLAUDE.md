# CarGame

## Git attribution

All commits in this repository are authored by the repository owner. When
working here:

- Commit as `jarvisar <adamjarvis04@gmail.com>` (author *and* committer).
- Do **not** add `Co-Authored-By: Claude ...`, `Claude-Session: ...`, or any
  other Anthropic/Claude attribution line to commit messages.
- Do **not** add "Generated with Claude Code" footers to pull request
  descriptions.
- Do **not** reference Claude, Anthropic, or model names in commit messages,
  PR titles/bodies, or code comments.

Set this up at the start of a session with:

```sh
git config user.name "jarvisar"
git config user.email "adamjarvis04@gmail.com"
git config commit.gpgsign false
```

(Signing is disabled because the sandbox's signing key does not belong to the
commit author, which would produce misattributed signatures.)
