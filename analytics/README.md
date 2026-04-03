# Nightshift Analytics

This folder contains a minimal first-party analytics pipeline for the public Nightshift site.

## What it tracks

- Page views
- Approx visitors using a short-lived 24 hour anonymous token
- Referrer host
- Device bucket: desktop, mobile, tablet
- Country and region from Cloudflare edge metadata when available
- Basic click events for outbound links, mailto links, tel links, and any element with `data-analytics-event`

## What it does not track

- IP addresses in storage
- Full user agent strings
- Long-lived personal identifiers
- Fingerprints

## Expected route layout

The public site sends events to `/api/analytics/collect` and the employee dashboard reads `/api/analytics/dashboard`.

Recommended deployment:

1. Put the site behind Cloudflare.
2. Deploy the worker in `analytics/worker/`.
3. Route `ns-tx.com/api/analytics/*` to that worker.
4. Keep the static site on GitHub Pages as-is.

## Setup

1. Create a D1 database.
2. Apply [schema.sql](/g:/4.%20Websites/goodmittens.github.io/analytics/schema.sql).
3. Copy [wrangler.toml.example](/g:/4.%20Websites/goodmittens.github.io/analytics/worker/wrangler.toml.example) to `wrangler.toml`.
4. Fill in the D1 database id and your allowed origins.
5. Set the worker secret:

```powershell
wrangler secret put SHIFT_DASHBOARD_PASSCODE
```

Use the same passcode you want the `/shift/` dashboard to send to the worker.

## Deploy

```powershell
cd analytics\worker
wrangler deploy
```

## Retention

The worker includes a daily cleanup handler. By default it deletes raw events older than 30 days.

Adjust `RETENTION_DAYS` in `wrangler.toml` if you want a shorter window.
