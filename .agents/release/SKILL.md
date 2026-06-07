---
name: release
description: Release package changes through the repository's GitHub Actions workflow.
---

# Release through GitHub Actions

Use this workflow when preparing and publishing package changes from this repository.

## Release policy

- Releases are triggered by pushing to `main`; do not publish packages from a local shell.
- Keep the working tree reviewable before release. Check `git status --short` and inspect all changed files.
- Update the affected package changelog before pushing a release commit.
- Run the same local checks that the release workflow runs when practical: `pnpm build` and `pnpm test`.
- Push the release commit to `main`, then monitor the `Release` GitHub Actions workflow.

## Steps

1. Inspect changes with `git status --short` and `git diff`.
2. Confirm the affected package version and changelog entry.
3. Run `pnpm build`.
4. Run `pnpm test`.
5. Commit the code, changelog, and release instructions together.
6. Push `main` to `origin`.
7. Confirm the `Release` workflow starts and completes successfully.

## Notes

- `.github/workflows/release.yml` stages release packages in dependency order and skips versions already published to npm.
- If the package set changes, update the workflow package list before releasing.
- If Actions fails, fix the repository state and push another commit instead of trying to publish manually.
