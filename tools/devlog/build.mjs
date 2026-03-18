import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const root = process.cwd();
const contentDir = path.join(root, "content", "devlog");
const outDir = path.join(root, "pages", "DevLog");
const postsDir = path.join(outDir, "posts");

const monthShort = (dateObj) =>
    dateObj.toLocaleString("en-US", { month: "short" }).toUpperCase();

const formatDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${monthShort(dateObj)} ${day}, ${dateObj.getFullYear()}`;
};

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

const readPosts = async () => {
    const files = await fs.readdir(contentDir);
    const posts = [];

    for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const raw = await fs.readFile(path.join(contentDir, file), "utf-8");
        const { data, content } = matter(raw);
        if (data.draft === true) continue;

        const dateObj = parseFrontmatterDate(data.date, file);
        posts.push({
            slug: path.basename(file, ".md"),
            title: data.title,
            dateObj,
            game: data.game,
            excerpt: data.excerpt,
            tags: Array.isArray(data.tags) ? data.tags : [],
            hero: data.hero || "",
            html: marked.parse(content),
        });
    }

    return posts.sort((a, b) => b.dateObj - a.dateObj);
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
            <div class="footer-bottom"><div class="social-row"><a class="action-pill hover-sound" href="https://twitter.com" target="_blank" rel="noopener noreferrer">X</a><a class="action-pill hover-sound" href="https://instagram.com" target="_blank" rel="noopener noreferrer">IG</a><a class="action-pill hover-sound" href="https://youtube.com" target="_blank" rel="noopener noreferrer">YT</a></div><p class="footer-note">Copyright 2026 Nightshift. All rights reserved.</p></div>
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
    const cards = posts.map((post) => `
            <article class="devlog-card">
                <div class="devlog-meta"><span>${post.game}</span><span>${formatDate(post.dateObj)}</span></div>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <a class="devlog-cta hover-sound" href="posts/${post.slug}.html">Read entry</a>
            </article>`).join("");

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
                <p class="eyebrow">Feed status</p>
                <div class="stack-list">
                    <div><span>Coverage</span><strong>Milestones / prototypes / operational notes</strong></div>
                    <div><span>Primary focus</span><strong>AfterDarkRP + studio build direction</strong></div>
                    <div><span>Format</span><strong>Short field reports and dated entries</strong></div>
                </div>
            </aside>
        </section>
        <section class="panel feed-panel">
            <div class="panel-heading"><p class="eyebrow">Latest Entries</p><h2>Current archive</h2></div>
            <div class="devlog-grid">${cards}
            </div>
        </section>`,
    });
};

const renderPost = (post) => {
    const tags = post.tags.length ? `<div class="tag-row">${post.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>` : "";
    const hero = post.hero ? `<div class="media-frame devlog-hero"><img src="${post.hero}" alt="${post.title}"></div>` : "";

    return layout({
        title: `Nightshift | ${post.title}`,
        assetPrefix: "../../..",
        pagePrefix: "../..",
        readout: "Devlog Entry",
        body: `
        <section class="page-hero-grid">
            <article class="page-hero-panel">
                <p class="eyebrow">Devlog / entry</p>
                <h1 class="page-title">${post.title}</h1>
                <p class="page-lede">${post.excerpt}</p>
                <div class="hero-actions"><a class="cta-btn hover-sound" href="../index.html">Back To Devlog</a></div>
                ${tags}
                ${hero}
            </article>
            <aside class="page-hero-panel">
                <p class="eyebrow">Entry metadata</p>
                <div class="stack-list">
                    <div><span>Project</span><strong>${post.game}</strong></div>
                    <div><span>Date</span><strong>${formatDate(post.dateObj)}</strong></div>
                    <div><span>Route</span><strong>Public archive</strong></div>
                </div>
            </aside>
        </section>
        <section class="panel feature-panel">
            <div class="panel-heading"><p class="eyebrow">Field Notes</p><h2>Entry body</h2></div>
            <div class="devlog-post-body">${post.html}</div>
        </section>`,
    });
};

const build = async () => {
    const posts = await readPosts();
    await ensureDir(postsDir);
    await fs.writeFile(path.join(outDir, "index.html"), renderIndex(posts));
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
