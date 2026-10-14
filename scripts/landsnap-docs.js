// Navigation enhancements only: the complete manual and anchors work without JS.
const index = document.querySelector('.docs-index');
const mobile = window.matchMedia('(max-width: 720px)');
const syncIndex = () => { index.open = !mobile.matches; };
syncIndex();
mobile.addEventListener('change', syncIndex);

const search = document.querySelector('#docs-search');
const status = document.querySelector('#docs-search-status');
const links = [...document.querySelectorAll('.docs-nav-group a')];
const sections = links.map(link => document.querySelector(link.getAttribute('href')));
document.querySelector('.docs-search').hidden = false;

// Filter the topic index, keeping the article intact for reading and browser Find.
search.addEventListener('input', () => {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    links.forEach((link, i) => {
        const text = sections[i].textContent.toLocaleLowerCase();
        const matches = terms.every(term => text.includes(term));
        link.parentElement.hidden = !matches;
        if (matches) count++;
    });
    document.querySelectorAll('.docs-nav-group').forEach(group => {
        group.hidden = ![...group.querySelectorAll('li')].some(item => !item.hidden);
    });
    status.textContent = terms.length ? (count ? `${count} matching topic${count === 1 ? '' : 's'}` : 'No matching topics. Try a different term.') : '';
});

links.forEach(link => link.addEventListener('click', () => {
    if (mobile.matches) index.open = false;
}));

// Mark the heading closest to the reading position, including direct deep links.
let scheduled = false;
const updateCurrent = () => {
    const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--docs-header-height')) + 60;
    let current = sections[0];
    sections.forEach(section => { if (section.getBoundingClientRect().top <= offset) current = section; });
    links.forEach(link => {
        if (link.getAttribute('href') === `#${current.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
    });
    scheduled = false;
};
window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateCurrent); }
}, { passive: true });
window.addEventListener('resize', updateCurrent);
window.addEventListener('hashchange', updateCurrent);
updateCurrent();
