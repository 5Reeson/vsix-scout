# Marketplace fixtures

These fixtures are minimized snapshots of public Visual Studio Marketplace
responses captured on 2026-08-10. Unrelated presentation metadata, statistics,
tags, and most historical versions were removed. No credentials, request
headers, cookies, local paths, or user data are stored.

Coverage:

- `universal-prettier.json`: missing `targetPlatform` means universal.
- `multi-platform-python.json`: one version with multiple platform variants.
- `prerelease-python.json`: stable and pre-release variants use the Marketplace
  property marker.
- `engine-fallback-python.json`: version `0.7.0` has no Engine property.
- `search-python.json`: a keyword search response for `python`, captured
  2026-08-08, minimized to the three top install counts
  (`ms-python.python`, `ms-python.vscode-pylance`, `ms-python.debugpy`).
- `manifests/python-0.7.0.json`: the corresponding official manifest supplies
  `engines.vscode` as `^1.9.0`.

The search fixture retains the `install` statistic even though the general
fixture policy omits statistics: the install count is an essential input for
the keyword-search normalization tests, which rank results by installs.

The fixtures intentionally preserve public publisher, version, asset URI, and
SHA-256 fields because those values are necessary to test normalization and URL
policy. Refreshing fixtures is a reviewed operation; CI never queries the live
Marketplace.
