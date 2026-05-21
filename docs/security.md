# Site Security Policy

This repository publishes the public Nightshift static site. Treat anything committed here as content that can be served from a trusted Nightshift domain.

## Hosted Payloads

Do not commit executable installers, archives, scripts, or other downloadable payloads directly into the static site. Risky file types are blocked by `npm run security:payloads` unless they are explicitly listed in `tools/security/payload-allowlist.json` with a specific reason.

Game builds, mods, tools, and launchers should ship as release artifacts with hashes and signatures. Public pages can link to those releases, but the site should not quietly become a file host for arbitrary binaries.

## Devlog Content

Devlog Markdown is rendered into public HTML by `tools/devlog/build.mjs`. Raw HTML is blocked in devlog bodies so future guest, community, CMS, or imported content cannot become trusted-origin script or markup.

Use the structured `:::gallery` block for media galleries instead of raw HTML.

## Third-Party JavaScript

The current public site still uses third-party executable JavaScript from `esm.sh` and `cdnjs` on specific pages. That is documented as a supply-chain risk, not evidence of compromise.

Preferred future fixes are to vendor/remove those scripts where practical and enforce a production Content Security Policy in Cloudflare.
