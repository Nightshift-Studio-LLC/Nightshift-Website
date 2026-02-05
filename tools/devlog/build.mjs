import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const root = process.cwd();
const contentDir = path.join(root, "content", "devlog");
const outDir = path.join(root, "pages", "devLog");
const postsDir = path.join(outDir, "posts");

const monthShort = (dateObj) =>
    dateObj.toLocaleString("en-US", { month: "short" }).toUpperCase();

const formatDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${monthShort(dateObj)} ${day}, ${year}`;
};

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

const readPosts = async () => {
    let files = [];
    try {
        files = await fs.readdir(contentDir);
    } catch (err) {
        throw new Error(`Missing content directory: ${contentDir}`);
    }

    const posts = [];
    for (const file of files) {
        if (!file.endsWith(".md")) {
            continue;
        }
        const filePath = path.join(contentDir, file);
        const raw = await fs.readFile(filePath, "utf-8");
        const { data, content } = matter(raw);
        if (data.draft === true) {
            continue;
        }

        const slug = path.basename(file, ".md");
        const dateObj = new Date(data.date);
        if (Number.isNaN(dateObj.getTime())) {
            throw new Error(`Invalid date in ${file}: ${data.date}`);
        }

        posts.push({
            slug,
            title: data.title,
            date: data.date,
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

const navMarkup = (pagePrefix) => `
        <nav class="nav-links">
            <a href="${pagePrefix}/home.html" class="hover-sound">home</a>
            <div class="nav-item dropdown">
                <a href="${pagePrefix}/games.html" class="hover-sound">games</a>
                <div class="dropdown-menu">
                    <a href="${pagePrefix}/games/spear.html">Codename SPEAR</a>
                    <a href="${pagePrefix}/games/elder.html">Codename ELDER</a>
                    <a href="${pagePrefix}/games/saint.html">Codename SAINT</a>
                    <a href="${pagePrefix}/games/hair.html">Codename HAIR</a>
                    <a href="${pagePrefix}/games/barn.html">Codename BARN</a>
                    <a href="${pagePrefix}/games/hook.html">Codename HOOK</a>
                </div>
            </div>
            <a href="${pagePrefix}/studio.html" class="hover-sound">studio</a>
            <a href="${pagePrefix}/contact.html" class="hover-sound">contact</a>
        </nav>`;

const footerMarkup = (pagePrefix) => `
    <footer>
        <div class="footer-menus">
            <ul class="footer-menu">
                <li><a href="${pagePrefix}/home.html">Home</a></li>
                <li><a href="${pagePrefix}/games.html">Games</a></li>
                <li><a href="${pagePrefix}/studio.html">Studio</a></li>
                <li><a href="${pagePrefix}/contact.html">Contact</a></li>
            </ul>
            <ul class="footer-menu">
                <li><a href="https://www.epicgames.com/site/en-US/privacypolicy" target="_blank" rel="noopener noreferrer">Epic Privacy Policy</a></li>
                <li><a href="#">Nightshift Privacy Policy</a></li>
                <li><a href="#">Applicant Privacy Policy</a></li>
                <li><a href="#">Site Cookie Policy</a></li>
            </ul>
            <ul class="footer-menu">
                <li><a href="#">Press Kit</a></li>
                <li><a href="#">Brand Assets</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Community</a></li>
            </ul>
        </div>
        <div class="social-bar">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" class="social-pill">X</a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" class="social-pill">IG</a>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" class="social-pill">YT</a>
        </div>
        <p class="footer-copyright">Copyright 2026 Nightshift. All rights reserved.</p>
    </footer>`;

const layout = ({ title, body, assetPrefix, pagePrefix }) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="${assetPrefix}/styles/header.css">
    <link rel="stylesheet" href="${assetPrefix}/styles/footer.css">
    <link rel="stylesheet" href="${assetPrefix}/styles/default-page.css">
    <link rel="stylesheet" href="${assetPrefix}/styles/devlog.css">
    <link rel="icon" type="image/x-icon" href="${assetPrefix}/images/icons/nightshift.ico">
</head>

<body>
    <div class="header">
        <a href="${pagePrefix}/home.html" class="hover-sound">
            <img src="${assetPrefix}/images/index/nightshift-transparent.png" alt="Nightshift Logo">
        </a>
${navMarkup(pagePrefix)}
    </div>
    <div class="header-spacer"></div>

    ${body}

${footerMarkup(pagePrefix)}

    <script>
        document.addEventListener("DOMContentLoaded", function() {
            const audio = new Audio("${assetPrefix}/audio/bop.mp3");
            audio.volume = 0.25;

            const path = window.location.pathname.toLowerCase();
            const page = path.split("/").pop();
            let active = "home";
            if (page === "" || page === "index.html" || page === "home.html") {
                active = "home";
            }
            if (page === "games.html" || path.includes("/games/")) {
                active = "games";
            }
            if (page === "studio.html" || page === "websites.html") {
                active = "studio";
            }
            if (page === "contact.html") {
                active = "contact";
            }

            document.querySelectorAll(".nav-links a").forEach((link) => {
                const label = link.textContent.trim().toLowerCase();
                if (label === active) {
                    link.classList.add("active");
                }
            });

            function playHoverSound() {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            }

            document.querySelectorAll(".hover-sound").forEach((element) => {
                element.addEventListener("mouseenter", playHoverSound);
            });
        });
    </script>
</body>
</html>`;

const renderIndex = (posts) => {
    const cards = posts
        .map(
            (post) => `
                <article class="devlog-card">
                    <div class="devlog-meta">
                        <span>${post.game}</span>
                        <span>${formatDate(post.dateObj)}</span>
                    </div>
                    <h3>${post.title}</h3>
                    <p>${post.excerpt}</p>
                    <a class="devlog-cta hover-sound" href="posts/${post.slug}.html">Read entry</a>
                </article>`
        )
        .join("");

    const body = `
    <main>
        <section class="page-hero section reveal">
            <div class="eyebrow">Devlog</div>
            <h1>Milestones, experiments, and creative notes from the pipeline.</h1>
            <p>We are documenting progress as we lock in systems, shape worlds, and refine the feel. Expect rough edges and honest updates.</p>
            <div class="hero-actions">
                <a class="cta-btn primary hover-sound" href="../games.html">Explore games</a>
            </div>
        </section>

        <section class="section reveal delay-1">
            <div class="section-title-row">
                <h2>Latest entries</h2>
                <p>Short reads on direction, prototypes, and what we are learning.</p>
            </div>
            <div class="devlog-grid">
                ${cards}
            </div>
        </section>
    </main>`;

    return layout({
        title: "Nightshift | Devlog",
        body,
        assetPrefix: "../..",
        pagePrefix: "..",
    });
};

const renderPost = (post) => {
    const tags = post.tags.length
        ? `<div class="tag-row">${post.tags
              .map((tag) => `<span class="tag">${tag}</span>`)
              .join("")}</div>`
        : "";

    const hero = post.hero
        ? `<div class="media-frame devlog-hero"><img src="${post.hero}" alt="${post.title}"></div>`
        : "";

    const body = `
    <main>
        <section class="page-hero section reveal">
            <div class="eyebrow">Devlog</div>
            <h1>${post.title}</h1>
            <p>${post.excerpt}</p>
            <div class="hero-actions">
                <a class="cta-btn ghost hover-sound" href="../index.html">Back to devlog</a>
            </div>
            ${tags}
            ${hero}
        </section>

        <section class="section reveal delay-1">
            <div class="surface">
                <ul class="list">
                    <li>Project: ${post.game}</li>
                    <li>Date: ${formatDate(post.dateObj)}</li>
                </ul>
            </div>
        </section>

        <section class="section reveal delay-2">
            <div class="surface devlog-post-body">
                ${post.html}
            </div>
        </section>
    </main>`;

    return layout({
        title: `Nightshift | ${post.title}`,
        body,
        assetPrefix: "../../..",
        pagePrefix: "../..",
    });
};

const build = async () => {
    const posts = await readPosts();
    await ensureDir(postsDir);

    await fs.writeFile(path.join(outDir, "index.html"), renderIndex(posts));
    for (const post of posts) {
        const html = renderPost(post);
        await fs.writeFile(path.join(postsDir, `${post.slug}.html`), html);
    }
};

const watch = async () => {
    await build();
    let timer = null;
    fs.watch(contentDir, { recursive: true }, () => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            build().catch((err) => console.error(err));
        }, 100);
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

