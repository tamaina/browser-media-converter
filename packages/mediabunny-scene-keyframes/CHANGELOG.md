# @browser-mc/mediabunny-scene-keyframes

## 0.2.0

### Breaking Changes

- Mediabunny is now a required peer dependency (`mediabunny: ^1.62.0`) instead of a regular dependency, so the application and this helper share one Mediabunny copy (separate copies fail runtime `instanceof` checks for caller-owned tracks and sinks).
  - Migration: install `mediabunny@^1.62` alongside this package, e.g. `pnpm add @browser-mc/mediabunny-scene-keyframes 'mediabunny@^1.62.0'`.

### Changes

- Update Mediabunny to 1.62.0.

## 0.1.0

- Include canonical repository metadata for npm provenance validation.
- Update Mediabunny to 1.61.1; retain sequential sample iteration and scene detection behavior.

## 0.0.1

### Patch Changes

- first release
