const AFTERDARKRP_CHANGELOG = [
    {
        date: "2026-02-13",
        version: "Alpha 0.3.0",
        title: "Pre-April launch push locked",
        summary: "Shifted scope to an MVP launch target before the April s&box release window with stability-first priorities.",
        bullets: [
            "Launch-critical systems list frozen for first public milestone.",
            "Core police/criminal loop prioritized over secondary feature expansion.",
            "Server-facing docs and rules alignment moved into the release path."
        ]
    },
    {
        date: "2026-02-12",
        version: "Alpha 0.2.3",
        title: "Justice and prison flow refinements",
        summary: "Improved arrest-to-resolution pacing with clearer timing and more reliable courthouse/prison routing.",
        bullets: [
            "Detain decision flow tuned for faster officer resolution.",
            "Sentence timing now scales consistently from charge count.",
            "Justice spawn marker usage verified for courthouse/prison teleports."
        ]
    },
    {
        date: "2026-02-10",
        version: "Alpha 0.2.0",
        title: "Economy and terminals pass",
        summary: "Expanded economy usability around wallet/bank interactions and crime terminal visibility.",
        bullets: [
            "ATM panel flow improved for deposit/withdraw routines.",
            "Crime terminal display improved for wanted/fine context.",
            "Payment history and wallet behavior tuned for readability."
        ]
    },
    {
        date: "2026-02-07",
        version: "Alpha 0.1.5",
        title: "Jobs baseline and role clarity",
        summary: "Established clearer category identity across Civil, Government, and Criminal job paths.",
        bullets: [
            "Role catalog pass on descriptions and salaries.",
            "Gameplay intent tightened per job category.",
            "Foundation prepared for loadout and equipment wiring."
        ]
    }
];

function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function renderItems(containerId, limit) {
    const host = document.getElementById(containerId);
    if (!host) return;

    const items = (limit ? AFTERDARKRP_CHANGELOG.slice(0, limit) : AFTERDARKRP_CHANGELOG)
        .map((entry) => {
            const bullets = entry.bullets.map((b) => `<li>${b}</li>`).join("");
            return `
                <article class="changelog-item">
                    <div class="changelog-meta">
                        <span>${formatDate(entry.date)}</span>
                        <span>${entry.version}</span>
                    </div>
                    <h3>${entry.title}</h3>
                    <p>${entry.summary}</p>
                    <ul class="bullets tight">
                        ${bullets}
                    </ul>
                </article>
            `;
        })
        .join("");

    host.innerHTML = items;
}

document.addEventListener("DOMContentLoaded", () => {
    renderItems("changelog-latest", 3);
    renderItems("changelog-archive", 0);
});
