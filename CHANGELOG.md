# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally simple while the project is pre-alpha.

## [Unreleased]

### Added

- Open-source community health files: `README`, `LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `SUPPORT`, and `GOVERNANCE`.
- GitHub automation: CI workflow, dependency review workflow, issue templates, pull request template, and `CODEOWNERS`.
- Tooling metadata: `.editorconfig`, `.nvmrc`, package metadata, `typecheck`, and `check` scripts.
- App smoke test coverage for the main shell and navigation.

### Changed

- Synced `package-lock.json` with the current dependency graph so `npm ci` works in CI.
- Fixed existing lint errors in generated UI and Tailwind config files.
