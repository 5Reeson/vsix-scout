# Security policy

## Supported versions

Until VSIX Scout reaches 1.0, only the latest published minor release receives
security fixes. Users should upgrade to the newest available release before
reporting a vulnerability.

## Reporting a vulnerability

Please use the repository's
[private security advisory form](https://github.com/5Reeson/vsix-scout/security/advisories/new).
Do not disclose exploit details, credentials, private Marketplace responses, or
sensitive local paths in a public issue.

Include the affected version, operating system, Node.js version, reproduction
steps, impact, and any proposed mitigation. Maintainers will acknowledge a
complete report within seven days and will coordinate disclosure after a fix is
available. This is a best-effort open-source response target, not a service-level
agreement.

## Security boundary

VSIX Scout resolves and downloads files; it never installs, extracts, loads, or
executes VSIX content. It restricts network requests to HTTPS Marketplace hosts,
validates every redirect, limits time and size, rejects non-ZIP responses,
verifies an upstream SHA-256 when present, and publishes files without
overwriting an existing destination.

A matching `engines.vscode` range and hash do not establish that an extension is
safe or that its publisher license permits a particular use. Users remain
responsible for reviewing extension provenance, licenses, and organizational
security policy.
