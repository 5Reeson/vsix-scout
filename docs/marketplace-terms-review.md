# Marketplace terms and extension-license review

Reviewed: 2026-08-10.

The current Microsoft Marketplace Terms state that publisher-specific terms
may apply and that users are responsible for reviewing those terms before using
an offer. The service and offer availability may also change. VSIX Scout
therefore treats Marketplace metadata as an external, fallible service and does
not imply that Microsoft or an extension publisher endorses this project.

Project behavior is intentionally narrow:

- Query official Visual Studio Marketplace metadata on the user's behalf.
- Resolve and download an official asset directly to the user's machine.
- Never mirror, permanently host, modify, repackage, or redistribute a
  third-party VSIX.
- Never install or execute an extension.
- Preserve the user's responsibility to review the extension's publisher terms,
  license, privacy behavior, and organizational policy.

Reference reviewed:
[Microsoft Marketplace Terms of Use](https://learn.microsoft.com/en-us/legal/marketplace/marketplace-terms)
(page last updated 2026-05-06 when reviewed).

This record is a product-scope review, not legal advice. Re-review the current
terms before each material release or before adding mirroring, proxying,
authentication, paid offers, or another Marketplace provider.
