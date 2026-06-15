import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { marked } from "marked";

const root = process.cwd();
const contentDir = path.join(root, "content", "devlog");
const outDir = path.join(root, "pages", "DevLog");
const postsDir = path.join(outDir, "posts");
const galleryBlockPattern = /^:::gallery\s*\n([\s\S]*?)\n:::/gm;
const youtubeBlockPattern = /^:::youtube\s*\n([\s\S]*?)\n:::/gm;
const rawHtmlPattern = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s|>|\/>)/;
const imageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm"]);

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const assertLocalMediaPath = (src, file) => {
    if (
        !src ||
        src.startsWith("/") ||
        src.startsWith("\\") ||
        src.includes("\\") ||
        src.includes("\0") ||
        /^[a-z][a-z0-9+.-]*:/i.test(src) ||
        src.startsWith("//") ||
        /["'<>]/.test(src)
    ) {
        throw new Error(`Invalid gallery media path in ${file}: ${src}`);
    }
};

const assertNoRawHtml = (content, file) => {
    const match = rawHtmlPattern.exec(content);
    if (!match) return;

    const line = content.slice(0, match.index).split("\n").length;
    throw new Error(`Raw HTML is not allowed in ${file}:${line}. Use Markdown or a :::gallery block.`);
};

const renderGalleryItem = (line, file) => {
    const [type, src, alt, caption] = line.split("|").map((part) => part.trim());
    assertLocalMediaPath(src, file);

    const ext = path.extname(src).toLowerCase();
    const safeCaption = escapeHtml(caption || "");

    if (type === "image") {
        if (!imageExtensions.has(ext)) {
            throw new Error(`Unsupported gallery image type in ${file}: ${src}`);
        }

        return `<figure>
<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || "")}">
<figcaption>${safeCaption}</figcaption>
</figure>`;
    }

    if (type === "video") {
        if (!videoExtensions.has(ext)) {
            throw new Error(`Unsupported gallery video type in ${file}: ${src}`);
        }

        return `<figure>
<video controls autoplay muted loop preload="metadata" playsinline>
<source src="${escapeHtml(src)}" type="video/${ext.slice(1)}">
Your browser does not support the video tag.
</video>
<figcaption>${safeCaption}</figcaption>
</figure>`;
    }

    throw new Error(`Unsupported gallery item type in ${file}: ${type}`);
};

const extractYoutubeId = (value, file) => {
    const source = String(value ?? "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(source)) {
        return source;
    }

    try {
        const url = new URL(source);
        const host = url.hostname.replace(/^www\./, "");

        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0];
            if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
        }

        if (host === "youtube.com" || host === "m.youtube.com") {
            const watchId = url.searchParams.get("v");
            if (/^[A-Za-z0-9_-]{11}$/.test(watchId ?? "")) return watchId;

            const parts = url.pathname.split("/").filter(Boolean);
            const route = parts[0];
            const routeId = parts[1];
            if ((route === "embed" || route === "shorts") && /^[A-Za-z0-9_-]{11}$/.test(routeId ?? "")) {
                return routeId;
            }
        }
    } catch {
        // Fall through to the consistent validation error below.
    }

    throw new Error(`Invalid YouTube media source in ${file}: ${source}`);
};

const renderYoutubeFigure = ({ source, title = "YouTube video", caption = "", file, className = "devlog-youtube" }) => {
    const id = extractYoutubeId(source, file);
    const safeTitle = escapeHtml(title || "YouTube video");
    const safeCaption = escapeHtml(caption || title || "");
    const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1`;

    return `<figure class="${escapeHtml(className)}">
<div class="video-frame">
<iframe src="${embedUrl}" title="${safeTitle}" allow="autoplay; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>
</div>
<figcaption>${safeCaption}</figcaption>
</figure>`;
};

const renderYoutubeBlocks = (content, file) =>
    content.replace(youtubeBlockPattern, (_match, body) => {
        const lines = body
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length !== 1) {
            throw new Error(`YouTube blocks in ${file} must contain exactly one video line.`);
        }

        const [source, title = "YouTube video", caption = ""] = lines[0].split("|").map((part) => part.trim());
        return renderYoutubeFigure({ source, title, caption, file });
    });

const renderGalleryBlocks = (content, file) =>
    content.replace(galleryBlockPattern, (_match, body) => {
        const items = body
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => renderGalleryItem(line, file))
            .join("\n");

        if (!items) {
            throw new Error(`Empty gallery block in ${file}`);
        }

        return `<div class="devlog-gallery">\n${items}\n</div>`;
    });

const renderMediaBlocks = (content, file) =>
    renderYoutubeBlocks(renderGalleryBlocks(content, file), file);

const validateDevlogContent = (content, file) => {
    const withoutMediaBlocks = content
        .replace(galleryBlockPattern, "")
        .replace(youtubeBlockPattern, "");
    assertNoRawHtml(withoutMediaBlocks, file);
};

const monthShort = (dateObj) =>
    dateObj.toLocaleString("en-US", { month: "short" }).toUpperCase();

const monthLong = (dateObj) =>
    dateObj.toLocaleString("en-US", { month: "long" });

const formatDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${monthShort(dateObj)} ${day}, ${dateObj.getFullYear()}`;
};

const postPath = (post) => `/pages/DevLog/posts/${post.slug}.html`;

const renderViewCount = (path) => `
                    <span class="devlog-view-count" data-view-count-path="${escapeHtml(path)}" data-view-count-state="loading" aria-label="Views loading">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                            <circle cx="12" cy="12" r="2.5"></circle>
                        </svg>
                        <b data-view-count-value>--</b><em>views</em>
                    </span>`;

const archiveConfig = [
    { year: 2026, months: [6, 5, 4, 3, 2, 1] },
];

const parseFrontmatterDate = (value, file) => {
    if (value instanceof Date) {
        return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    if (typeof value !== "string") {
        throw new Error(`Invalid date in ${file}: ${value}`);
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new Error(`Invalid date in ${file}: ${value}`);
    }
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
};

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

const parseFrontmatter = (raw, file) => {
    if (!raw.startsWith("---\n")) {
        return { data: {}, content: raw };
    }

    const endMarker = "\n---\n";
    const endIndex = raw.indexOf(endMarker, 4);
    if (endIndex === -1) {
        throw new Error(`Unclosed frontmatter block in ${file}`);
    }

    const frontmatterSource = raw.slice(4, endIndex);
    const content = raw.slice(endIndex + endMarker.length);
    const parsed = yaml.load(frontmatterSource);

    if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new Error(`Frontmatter in ${file} must parse to an object.`);
    }

    return {
        data: parsed ?? {},
        content,
    };
};

const readPosts = async () => {
    const files = await fs.readdir(contentDir);
    const posts = [];

    for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const raw = await fs.readFile(path.join(contentDir, file), "utf-8");
        const { data, content } = parseFrontmatter(raw, file);
        if (data.draft === true) continue;

        validateDevlogContent(content, file);
        const dateObj = parseFrontmatterDate(data.date, file);
        posts.push({
            slug: path.basename(file, ".md"),
            title: data.title,
            dateObj,
            game: data.game,
            signer: data.signer || "Nightshift",
            author: data.author || "Codex",
            excerpt: data.excerpt,
            tags: Array.isArray(data.tags) ? data.tags : [],
            hero: data.hero || "",
            html: marked.parse(renderMediaBlocks(content, file)),
        });
    }

    return posts.sort((a, b) => b.dateObj - a.dateObj);
};

const groupPostsByMonth = (posts) => {
    const groups = [];

    for (const post of posts) {
        const year = post.dateObj.getFullYear();
        const month = post.dateObj.getMonth() + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;
        const currentGroup = groups.at(-1);

        if (!currentGroup || currentGroup.key !== key) {
            groups.push({
                key,
                year,
                month,
                monthName: monthLong(post.dateObj),
                posts: [post],
            });
            continue;
        }

        currentGroup.posts.push(post);
    }

    return groups;
};

const softwareMarquee = () => `
            <section class="software-marquee-section" aria-label="Software used by Nightshift">
                <div class="software-marquee"><div class="software-marquee-track">
                    <span>Unreal / Source 2 / Enfusion / RAGE</span><span>Blender</span><span>Adobe Suite</span><span>Adobe 3D</span><span>Affinity Suite</span><span>Gaea 2.0</span><span>CC5</span><span>iClone 8</span><span>Marvelous Designer</span><span>Ornatrix</span><span>FruityLoops</span><span>VS Code</span><span>Visual Studio</span><span>GitHub</span><span>Git LFS</span><span>Git Pages</span><span>Wix</span><span>Codex</span>
                    <span>Unreal / Source 2 / Enfusion / RAGE</span><span>Blender</span><span>Adobe Suite</span><span>Adobe 3D</span><span>Affinity Suite</span><span>Gaea 2.0</span><span>CC5</span><span>iClone 8</span><span>Marvelous Designer</span><span>Ornatrix</span><span>FruityLoops</span><span>VS Code</span><span>Visual Studio</span><span>GitHub</span><span>Git LFS</span><span>Git Pages</span><span>Wix</span><span>Codex</span>
                </div></div>
            </section>`;

const footerMarkup = (pagePrefix) => `
        <footer class="site-footer panel">
${softwareMarquee()}
            <div class="footer-grid">
                <div class="footer-column"><span>Primary routes</span><a class="hover-sound" href="${pagePrefix}/home.html">Home</a><a class="hover-sound" href="${pagePrefix}/games.html">Games</a><a class="hover-sound" href="${pagePrefix}/studio.html">Studio</a><a class="hover-sound" href="${pagePrefix}/contact.html">Contact</a></div>
                <div class="footer-column"><span>Public records</span><a class="hover-sound" href="${pagePrefix}/DevLog/index.html">Devlog</a><a href="https://www.epicgames.com/site/en-US/privacypolicy" target="_blank" rel="noopener noreferrer">Epic Privacy Policy</a><a href="#">Nightshift Privacy Policy</a><a href="#">Applicant Privacy Policy</a></div>
                <div class="footer-column"><span>External surfaces</span><a href="#">Press Kit</a><a href="#">Brand Assets</a><a href="#">Careers</a><a href="#">Community</a></div>
            </div>
            <div class="footer-bottom"><div class="social-row"><a class="action-pill hover-sound" href="https://www.youtube.com/@nstx" target="_blank" rel="noopener noreferrer">YouTube</a></div><p class="footer-note">Copyright 2026 Nightshift. All rights reserved.</p></div>
        </footer>`;

const layout = ({ title, body, assetPrefix, pagePrefix, readout }) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="icon" type="image/x-icon" href="${assetPrefix}/images/icons/nightshift.ico">
    <link rel="stylesheet" href="${assetPrefix}/styles/home-modus-mockup.css">
    <script defer src="/scripts/analytics.js" data-analytics-endpoint="/api/analytics"></script>
</head>
<body>
    <div class="screen-fx" aria-hidden="true"></div>
    <header class="topbar">
        <a class="brand hover-sound" href="${pagePrefix}/home.html" aria-label="Nightshift home">
            <img src="${assetPrefix}/images/index/nightshift-transparent.png" alt="Nightshift logo">
        </a>
        <nav class="utility-nav" aria-label="Primary">
            <a href="${pagePrefix}/home.html" class="hover-sound">Home</a>
            <a href="${pagePrefix}/games.html" class="hover-sound">Games</a>
            <a href="${pagePrefix}/studio.html" class="hover-sound">Studio</a>
            <a href="${pagePrefix}/DevLog/index.html" class="hover-sound active">Devlog</a>
            <a href="${pagePrefix}/contact.html" class="hover-sound">Contact</a>
        </nav>
        <div class="topbar-readout"><span>${readout}</span><strong id="mockup-clock">00:00:00 CST</strong></div>
    </header>
    <main class="shell page-shell">
${body}
${footerMarkup(pagePrefix)}
    </main>
    <script>
        document.addEventListener("DOMContentLoaded", function() {
            const audio = new Audio("${assetPrefix}/audio/bop.mp3");
            audio.volume = 0.25;
            const clock = document.getElementById("mockup-clock");
            function updateClock() {
                if (!clock) return;
                clock.textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });
            }
            document.querySelectorAll(".hover-sound").forEach((element) => {
                element.addEventListener("mouseenter", function() {
                    audio.currentTime = 0;
                    audio.play().catch(() => {});
                });
            });
            updateClock();
            window.setInterval(updateClock, 1000);
        });
    </script>
</body>
</html>`;

const renderIndex = (posts) => {
    const renderCard = (post) => `
            <article class="devlog-card">
                <div class="devlog-meta"><span>${escapeHtml(post.game)}</span><span>${formatDate(post.dateObj)}</span>${renderViewCount(postPath(post))}</div>
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.excerpt)}</p>
                <a class="devlog-cta hover-sound" href="posts/${post.slug}.html">Read entry</a>
            </article>`;
    const monthGroups = groupPostsByMonth(posts);
    const archiveNav = archiveConfig.map(({ year, months }) => {
        const links = months.map((month) => {
            const key = `${year}-${String(month).padStart(2, "0")}`;
            const group = monthGroups.find((entry) => entry.key === key);

            if (!group) return "";

            return `
                    <a class="devlog-archive-link hover-sound" href="#archive-${group.key}">
                        <span>${group.monthName}</span>
                        <strong>${String(group.posts.length).padStart(2, "0")}</strong>
                    </a>`;
        }).join("");

        if (!links.trim()) return "";

        return `
                <div class="devlog-archive-year">
                    <span class="devlog-archive-year-label">${year}</span>
                    <div class="devlog-archive-links">${links}
                    </div>
                </div>`;
    }).join("");
    const monthSections = monthGroups.map((group) => `
                <section class="devlog-month-section" id="archive-${group.key}">
                    <div class="devlog-month-heading">
                        <p class="eyebrow">${group.year} Archive</p>
                        <h3>${group.monthName}</h3>
                    </div>
                    <div class="devlog-grid">${group.posts.map(renderCard).join("")}
                    </div>
                </section>`).join("");

    return layout({
        title: "Nightshift | Devlog",
        assetPrefix: "../..",
        pagePrefix: "..",
        readout: "Devlog Feed",
        body: `
        <section class="page-hero-grid">
            <article class="page-hero-panel">
                <p class="eyebrow">Devlog / public record</p>
                <h1 class="page-title">Milestones, experiments, and creative notes from the pipeline.</h1>
                <p class="page-lede">Nightshift documents progress as systems lock in, worlds take shape, and new public-facing surfaces come online.</p>
                <div class="hero-actions"><a class="cta-btn primary hover-sound" href="../games.html">Explore Games</a></div>
            </article>
            <aside class="page-hero-panel">
                <p class="eyebrow">Project status</p>
                <div class="stack-list">
                    <div><span>Primary focus</span><strong>AfterDarkRP + studio build direction</strong></div>
                    <div><span>Project Saint</span><strong><a class="inline-link hover-sound" href="/afterdark/">Rolling into AfterDark</a></strong></div>
                    <div><span>Elder</span><strong>Postponed</strong></div>
                    <div><span>SPEAR</span><strong>Arma Exile live service before standalone</strong></div>
                    <div><span>Format</span><strong>Short field reports and dated entries</strong></div>
                </div>
            </aside>
        </section>
        <section class="panel feed-panel">
            <div class="panel-heading"><p class="eyebrow">Latest Entries</p><h2>Recent Logs</h2></div>
            <div class="devlog-archive-layout">
                <aside class="devlog-archive-rail" aria-label="Devlog archives">
                    <div class="devlog-archive-heading">
                        <p class="eyebrow">Actual Archives</p>
                        <h3>Browse by date</h3>
                    </div>
                    ${archiveNav}
                </aside>
                <div class="devlog-archive-content">${monthSections}
                </div>
            </div>
        </section>`,
    });
};

const renderPost = (post) => {
    const tags = post.tags.length ? `<div class="tag-row">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : "";
    const hero = post.hero ? `<div class="media-frame devlog-hero"><img src="${escapeHtml(post.hero)}" alt="${escapeHtml(post.title)}"></div>` : "";
    const projectLabel = post.game === "AfterDarkRP"
        ? `<a class="inline-link hover-sound" href="/afterdark/">${escapeHtml(post.game)}</a>`
        : escapeHtml(post.game);
    const signoff = `
            <div class="devlog-signoff">
                <p>Signed, <strong>${escapeHtml(post.signer)}</strong></p>
            </div>`;

    return layout({
        title: `Nightshift | ${escapeHtml(post.title)}`,
        assetPrefix: "../../..",
        pagePrefix: "../..",
        readout: "Devlog Entry",
        body: `
        <section class="page-hero-grid">
            <article class="page-hero-panel">
                <p class="eyebrow">Devlog / entry</p>
                <h1 class="page-title">${escapeHtml(post.title)}</h1>
                <p class="page-lede">${escapeHtml(post.excerpt)}</p>
                <div class="hero-actions"><a class="cta-btn hover-sound" href="../index.html">Back To Devlog</a></div>
                ${tags}
                ${hero}
            </article>
            <aside class="page-hero-panel">
                <p class="eyebrow">Entry metadata</p>
                <div class="stack-list">
                    <div><span>Project</span><strong>${projectLabel}</strong></div>
                    <div><span>Date</span><strong>${formatDate(post.dateObj)}</strong></div>
                    <div><span>Signed by</span><strong>${escapeHtml(post.signer)}</strong></div>
                    <div><span>Authored by</span><strong>${escapeHtml(post.author)}</strong></div>
                    <div><span>Views</span><strong>${renderViewCount(postPath(post))}</strong></div>
                    <div><span>Route</span><strong>Public archive</strong></div>
                </div>
            </aside>
        </section>
        <section class="panel feature-panel">
            <div class="panel-heading"><p class="eyebrow">Field Notes</p><h2>Entry body</h2></div>
            <div class="devlog-post-body">${post.html}${signoff}</div>
        </section>`,
    });
};

const build = async () => {
    const posts = await readPosts();
    await ensureDir(postsDir);
    const indexMarkup = renderIndex(posts);
    await fs.writeFile(path.join(outDir, "index.html"), indexMarkup);
    await fs.writeFile(path.join(outDir, "devlog.html"), indexMarkup);
    for (const post of posts) {
        await fs.writeFile(path.join(postsDir, `${post.slug}.html`), renderPost(post));
    }
};

const watch = async () => {
    await build();
    let timer = null;
    fs.watch(contentDir, { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => build().catch((err) => console.error(err)), 100);
    });
    console.log("Watching devlog content for changes...");
};

if (process.argv.includes("--watch")) {
    watch().catch((err) => {
        console.error(err);
        process.exit(1);
    });
} else {
    build().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
