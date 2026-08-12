# Frontend Style Notes

## Cursor-revealed binary texture

The desired visual reference is the interaction seen in Cloudflare University:
<https://www.cloudflare.com/connect/cloudflare-university/>.

It does not have one universal official name. The most useful descriptions are:

- **Cursor spotlight reveal**: a cursor-driven spotlight that reveals a layer.
- **Mouse-following mask**: a radial mask that follows the pointer.
- **Binary code texture** or **data texture**: the underlying repeated binary or code-like text pattern.

This is not "Matrix code rain" because the characters are not falling. A typical implementation places a low-contrast binary-text layer behind the content, then uses a pointer-positioned radial gradient in `mask-image` or opacity/color to reveal it under the cursor.

Useful search phrases:

- `cursor spotlight reveal binary background`
- `mouse following radial mask text pattern`
- `CSS mask-image cursor reveal`

## Product-fit note

For VSIX Scout, this interaction could be used sparingly as a non-interactive background texture in the Web UI header or result surface. It should remain decorative only, never obscure form controls or result text, and should fall back to a static low-contrast texture for touch devices and reduced-motion users.
