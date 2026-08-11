# Release process

VSIX Scout publishes one user-facing npm package, `vsix-scout`. The monorepo's
internal packages remain private and are bundled into a dependency-free Node.js
20-compatible CLI artifact.

## One-time setup

1. Enable private vulnerability reporting and branch protection in GitHub.
2. Create the `vsix-scout` npm package on the first publish. npm cannot attach a
   trusted publisher before a package exists, so the initial release may require
   an `NPM_TOKEN` repository secret with publish permission.
3. After the package exists, configure npm trusted publishing for repository
   `5Reeson/vsix-scout` and workflow filename `release.yml`, then remove the
   long-lived `NPM_TOKEN` if OIDC publishing succeeds.
4. Protect the `v*` tag pattern so only maintainers can create release tags.

## Release checklist

1. Update `package.json`, `PROJECT_VERSION`, and `CHANGELOG.md` to the same
   version. Move changelog entries from Unreleased to the release date.
2. Run `pnpm release:check` in a clean worktree.
3. Merge the reviewed release commit to `main` and wait for CI.
4. Create and push an annotated tag such as `v0.1.0` from the exact main commit.
5. The release workflow validates the tag, runs all checks, produces and
   clean-installs the tarball, writes a SHA-256 sidecar, creates a draft GitHub
   Release, publishes npm with provenance, then makes the GitHub Release public.
6. Verify `npm exec --package=vsix-scout@0.1.0 -- vsix-scout --version` from a
   clean directory and compare the GitHub artifact checksum.

Do not rerun a failed npm publication by moving an existing tag. Diagnose the
failure, preserve the immutable published version, and release a patch version
when necessary.

References:

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
