# GitHub Pages: a practical user guide

Checked against GitHub's official documentation on October 4, 2026.

## 1. What GitHub Pages does

GitHub Pages publishes a website from files in a GitHub repository. Use HTML for page structure, CSS for appearance, and JavaScript for browser interactions. It suits portfolios, documentation, project pages, and devlogs. Server-side code such as PHP or a running Python application needs separate hosting. [How Pages works](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Supported site setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Your normal workflow is:

**Edit files → preview → commit → push → check deployment → check the live page.**

## 2. Choose your site address

| Site type | Repository name | Default address |
| --- | --- | --- |
| Personal site | `YOUR-USERNAME.github.io` | `https://YOUR-USERNAME.github.io/` |
| Organization site | `YOUR-ORGANIZATION.github.io` | `https://YOUR-ORGANIZATION.github.io/` |
| Project site | Any repository name, such as `my-project` | `https://YOUR-USERNAME.github.io/my-project/` |

Each account can have one personal or organization site, plus project sites in other repositories. A custom domain can replace the default address. [Site types](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## 3. Publish your first HTML website

For a new, simple site:

1. Create a repository on GitHub. On GitHub Free, use a public repository. For a personal site, name it `YOUR-USERNAME.github.io`.
2. Select **Add file → Create new file** and name the file `index.html`.
3. Paste the example below and select **Commit changes**.
4. Open **Settings → Pages**.
5. Under **Build and deployment → Source**, select **Deploy from a branch**.
6. Select `main` and `/(root)`, then **Save**.
7. Check the deployment in **Actions**, then use **Visit site** in Pages settings. Publishing may take up to ten minutes. [Quickstart](https://docs.github.com/en/pages/quickstart).

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My website</title>
</head>
<body>
  <h1>My website</h1>
  <p>My first page is online.</p>
  <a href="about.html">About this project</a>
</body>
</html>
```

Create `about.html` alongside it to make that link work. A root `index.html` becomes the home page; `about.html` becomes `/about.html`. A folder containing `index.html`, such as `projects/index.html`, provides `/projects/`.

## 4. Pick the publishing method

| Method | Use it when | What you provide |
| --- | --- | --- |
| Deploy from a branch | The publishable files are already committed | A branch and either `/(root)` or `/docs` |
| GitHub Actions | Files need a custom build before publishing | A workflow that builds and deploys the finished static files |

Branch publishing does not automatically run your `npm` scripts. Build generated content locally and commit the output, or use an Actions workflow that runs the build. Selecting **GitHub Actions** alone does not create a finished deployment pipeline; choose and configure a Pages workflow template. Its deployed artifact needs an entry file at its top level. [Publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Branch publishing uses Jekyll by default. For a plain HTML site that should bypass Jekyll, an empty `.nojekyll` file belongs at the root of the publishing source. Jekyll themes and `_config.yml` are optional, rather than requirements for hand-authored HTML. [Creating a site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## 5. Update a site

For a small browser edit, open the file on GitHub, select the pencil icon, edit it, and commit. For several files, use your local editor or GitHub Desktop.

A typical local Git sequence, after reviewing your edits:

```powershell
git status --short
git diff
git add index.html
git commit -m "Update home page introduction"
git push
```

Replace `index.html` with the actual files you intend to publish. If your publishing branch differs from the current branch, merge your change into it through your normal review process.

After pushing:

1. Open **Actions** and check the Pages deployment for the new commit.
2. Open the live route you changed.
3. Refresh and test its links, images, and interactions.
4. For layout changes, inspect desktop and mobile widths.

A successful test workflow and a successful Pages deployment are separate results. GitHub's Pages settings link to the latest deploying workflow. [Deployment workflow behavior](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 6. Keep links and assets working

Example file layout:

```text
index.html
pages/
  about.html
styles/
  site.css
images/
  logo.png
```

From `index.html`, use `styles/site.css` and `images/logo.png`. From `pages/about.html`, use `../styles/site.css` and `../images/logo.png`.

Relative paths are useful for project sites: `/images/logo.png` starts at the domain root, while `images/logo.png` resolves from the current page's directory. A project site's `/my-project/` prefix matters. Match filename capitalization exactly and use `/` in website URLs.

## 7. Connect a custom domain

1. Verify domain ownership in GitHub using its [domain verification instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages).
2. In the repository's **Settings → Pages → Custom domain**, enter your domain and save it before pointing DNS at Pages.
3. At your DNS provider, configure the appropriate records:
   - For `www.example.com`, a `CNAME` pointing to `YOUR-USERNAME.github.io` or `YOUR-ORGANIZATION.github.io`, without a repository path.
   - For `example.com`, use the documented `ALIAS`, `ANAME`, or GitHub Pages `A` records.
4. Allow time for DNS propagation; GitHub documents up to 24 hours.

With branch publishing, saving a custom domain creates a repository `CNAME` file. Custom Actions publishing uses the domain setting and ignores that file. [Custom domain setup and current DNS values](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

Enable **Enforce HTTPS** in Pages settings when available. Use HTTPS for externally hosted images, scripts, and styles to avoid mixed-content failures. [HTTPS setup](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## 8. Solve common problems

| Symptom | First checks |
| --- | --- |
| Home page gives a 404 | Confirm Pages is enabled, deployment succeeded, and `index.html` is at the publishing root. |
| One page or image gives a 404 | Check the filename, capitalization, directory, and project-site URL prefix. |
| Old content remains | Check which commit deployed, allow publishing time, then hard-refresh the browser. |
| CSS or scripts fail | Inspect the browser's Network and Console panels for incorrect URLs or mixed content. |
| Build fails | Open the failing Actions job and inspect the first relevant error. |
| Custom domain fails | Compare Pages settings and DNS records with the official domain instructions. |

GitHub provides [404 troubleshooting](https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites) and [HTTPS troubleshooting](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## 9. Apply this to the Nightshift repository

These facts were checked in the local checkout:

- The folder is named `goodmittens.github.io`, but `origin` points to [Nightshift-Studio-LLC/Nightshift-Website](https://github.com/Nightshift-Studio-LLC/Nightshift-Website).
- The current local branch is `main`; the root home page is `index.html`.
- The repository `CNAME` contains `ns-tx.com`. This records a domain in source, but does not confirm current GitHub settings or DNS.
- Main page sources are in `pages/`, shared CSS in `styles/`, and media in their corresponding asset folders.
- Edit devlog Markdown in `content/devlog/`, then run `npm run build:devlog`. Review the resulting `pages/DevLog/` files with the source change.
- `.github/workflows/site-security.yml` checks payloads, builds the devlog, and audits dependencies. It does not contain a Pages deployment job.

For this existing site, first inspect **Settings → Pages** to confirm the actual publishing method, branch/folder, and domain. The local checkout alone cannot establish those settings. If publishing directly from `main`, pushing reviewed changes there can update the live site.

## 10. Know the hosting boundaries

The published site has a 1 GB maximum and a soft bandwidth limit of 100 GB per month. GitHub Pages also restricts sites primarily facilitating commercial transactions or commercial SaaS. Consult the [current usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) when planning hosting.

Keep private API keys out of browser JavaScript and published files. Browser code can be inspected by visitors; privileged API operations belong in a separate backend.

Start further reading with the [official GitHub Pages documentation](https://docs.github.com/en/pages).
