/* Page interactions and an illustrative placement study, not the Unreal solver. */
(() => {
    // Dormant until the section is explicitly enabled and given a hosted player URL.
    const liveSection = document.getElementById('live-demo');
    const liveStart = document.getElementById('landsnap-live-start');
    if (liveSection && liveStart) {
        liveStart.addEventListener('click', () => {
            if (liveSection.hidden) return;
            const status = document.getElementById('landsnap-live-status');
            let playerUrl;
            try {
                playerUrl = new URL(liveSection.dataset.streamUrl);
                if (playerUrl.protocol !== 'https:') throw new Error('HTTPS player required');
            } catch {
                status.textContent = 'The live demo is not available yet. Please check back later.';
                return;
            }
            const frame = document.createElement('iframe');
            frame.title = 'LandSnap live Unreal Editor demo';
            frame.allow = 'autoplay; fullscreen';
            frame.allowFullscreen = true;
            frame.src = playerUrl.href;
            document.getElementById('landsnap-live-player').append(frame);
            status.textContent = 'Use the player below to connect. If it is unavailable, please try again later.';
            liveStart.disabled = true;
        });
    }
    const motionButton = document.querySelector('.landsnap-motion-toggle');
    const footer = document.querySelector('.site-footer');
    if (motionButton && footer) {
        motionButton.hidden = false;
        motionButton.setAttribute('aria-pressed', 'false');
        motionButton.addEventListener('click', () => {
            const paused = footer.classList.toggle('landsnap-motion-paused');
            motionButton.textContent = paused ? 'Resume footer motion' : 'Pause footer motion';
            motionButton.setAttribute('aria-pressed', String(paused));
        });
    }
    const svg = document.getElementById('landsnap-terrain');
    const button = document.getElementById('landsnap-snap-demo');
    if (!svg || !button) return;
    const ns = 'http://www.w3.org/2000/svg';
    const add = (tag, attributes, parent = svg) => {
        const node = document.createElementNS(ns, tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        parent.append(node);
        return node;
    };
    const height = (x, y) => 23 * Math.sin(x * 0.65) + 18 * Math.cos(y * 0.7) + x * 3;
    const project = (x, y, z = height(x, y)) => [360 + (x - y) * 29, 265 + (x + y) * 13 - z];
    const points = list => list.map(p => p.join(',')).join(' ');
    const path = list => list.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ');
    const terrain = add('g', {class: 'study-ground'});
    for (let x = -5; x < 5; x++) {
        for (let y = -5; y < 5; y++) {
            add('polygon', {points: points([project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)]), fill: `rgba(167,230,83,${0.025 + (height(x, y) + 60) / 1400})`, stroke: 'none'}, terrain);
        }
    }
    for (let i = -5; i <= 5; i += 0.5) {
        const a = [], b = [];
        for (let j = -5; j <= 5; j += 0.2) { a.push(project(i, j)); b.push(project(j, i)); }
        add('path', {d: path(a), fill: 'none', stroke: '#a7e653', 'stroke-opacity': Number.isInteger(i) ? '.3' : '.12', 'stroke-width': '.8'}, terrain);
        add('path', {d: path(b), fill: 'none', stroke: '#a7e653', 'stroke-opacity': Number.isInteger(i) ? '.3' : '.12', 'stroke-width': '.8'}, terrain);
    }
    const locations = [[-3,-2],[-1,-3],[2,-2],[-2,1],[1,1],[3,3]];
    const actors = [];
    locations.forEach(([x,y], index) => {
        const z = height(x, y), size = 0.6;
        const base = [[x-size,y-size],[x+size,y-size],[x+size,y+size],[x-size,y+size]].map(([a,b]) => project(a,b,z));
        const top = base.map(([a,b]) => [a,b-34]);
        const center = project(x,y,z);
        add('ellipse', {cx: center[0], cy: center[1]+3, rx: 28, ry: 11, fill:'#a7e653', opacity:'.12'});
        add('path', {d: `M${center[0]},${center[1]}v-95`, class:'study-guide', fill:'none', stroke:'#ff8752', 'stroke-dasharray':'3 5', 'stroke-opacity':'.5'});
        const actor = add('g', {class:'study-actor', style:`--actor-delay: ${index * 65}ms; transform: translateY(-76px)`});
        add('polygon', {points:points([base[1],base[2],top[2],top[1]]),fill:'#496b3b',stroke:'#c7ff6e','stroke-width':'1'}, actor);
        add('polygon', {points:points([base[2],base[3],top[3],top[2]]),fill:'#253d2b',stroke:'#a7e653','stroke-width':'1'}, actor);
        add('polygon', {points:points(top),fill:'#8cab67',stroke:'#dbf4b1','stroke-width':'1'}, actor);
        const label = add('text', {x:center[0],y:center[1]-47,fill:'#bbc6ca','font-size':'10','text-anchor':'middle','font-family':'monospace'},actor);
        label.textContent = `0${index + 1}`;
        actors.push(actor);
    });
    button.hidden = false;
    button.addEventListener('click', () => {
        const settled = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(settled));
        svg.parentElement.dataset.settled = String(settled);
        actors.forEach(actor => actor.style.transform = settled ? 'translateY(0)' : 'translateY(-76px)');
        button.querySelector('span').textContent = settled ? 'Reset placement' : 'Snap Selected';
        document.getElementById('landsnap-study-state').textContent = settled ? '06 actors · on the surface' : '06 actors · awaiting placement';
        svg.setAttribute('aria-label', settled ? 'Six illustrated blocks resting on the terrain surface.' : 'Six illustrated blocks above the terrain surface.');
    });
})();
