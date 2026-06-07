# Agent Notes

## Releasing

This repository releases through GitHub Actions. To release changes, prepare a normal commit on `main`, push it to `origin`, and let the `Release` workflow run.

Do not publish from a local terminal. The release workflow installs dependencies, builds, tests, packs `@browser-mc/browser-image-resizer-ex`, and stages the package through npm.

Before pushing a release commit:

- Review the working tree with `git status --short` and `git diff`.
- Update the relevant package changelog.
- Run `pnpm build`.
- Run `pnpm test`.

After pushing, monitor the `Release` workflow in GitHub Actions. If it fails, make a follow-up commit and push again.
