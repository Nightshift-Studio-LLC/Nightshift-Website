# LandSnap documentation page

The standalone user manual is `pages/Studio/LandsnapDocumentation.html`, styled by `styles/landsnap-docs.css` with optional navigation enhancements in `scripts/landsnap-docs.js`. The existing product page and its expandable guide remain available, with a link to this second page.

This is hand-authored static HTML; no generator or build step is required. Preview it from the site root at `/pages/Studio/LandsnapDocumentation.html`. Publish through the site's normal process only when authorized.

## Content maintenance

The guide's initial content was checked against the authoritative LandSnap `README.md`, `LandSnapSettings.h`, and `LandSnapAudit.h` on 2026-10-11. Update labels, default values, and behavior when the corresponding product changes. Keep the guide focused on customer controls and results; internal solver diagnostics and release evidence belong in the plugin repository.

Keep section IDs stable for inbound links. Each top-level section has a matching topic-index entry. Topic search filters the index against full section text without hiding the article. All sections and links remain available without JavaScript. Desktop uses a sticky index; mobile uses an expandable index. Wide numeric tables scroll locally and can receive keyboard focus. Print styles remove navigation and fit tables to the page.

## Adding screenshots or GIFs later

Place actual editor captures under `images/landsnap/docs/` with descriptive filenames. The page deliberately has no empty media placeholders or simulated editor evidence. Useful first captures are a first snap, AutoSnap after moving an actor, tagged-surface setup, and review/repair.

Insert a figure beside the relevant instruction:

```html
<figure class="docs-figure">
    <img src="../../images/landsnap/docs/snap-selected.gif"
         alt="Selected props settling onto Landscape after Snap Selected."
         width="960" height="540" loading="lazy">
    <figcaption>Snap Selected places the current selection against the chosen terrain.</figcaption>
</figure>
```

That path is an example, not an existing asset; add the capture before adding its reference. For long or large animated captures, a controlled video with a still poster is preferable so readers can pause it. The same `docs-figure` styles support `<video controls preload="none">`. Avoid autoplay and preserve a useful text explanation alongside motion.

## Review checklist

- Inspect the page on desktop and at 390 px and 320 px mobile widths.
- Check index links, direct anchors, active topic state, topic-search empty results, and mobile index collapse after navigation.
- Check keyboard focus, skip link, and wide-table scrolling without page-wide overflow.
- Verify local assets, related-page links, unique IDs, and table header/row consistency.
- Confirm the original guide remains intact and the new page is reachable from it.
- Treat local review and public deployment as separate evidence.
