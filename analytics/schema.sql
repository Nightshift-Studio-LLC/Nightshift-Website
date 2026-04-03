CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK (event_type IN ('pageview', 'event')),
    event_name TEXT,
    path TEXT NOT NULL,
    page_title TEXT,
    site_host TEXT,
    referrer_host TEXT,
    referrer_path TEXT,
    device_type TEXT,
    viewport_width INTEGER,
    viewport_height INTEGER,
    language TEXT,
    timezone TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    visitor_id TEXT,
    link_url TEXT,
    link_text TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
    ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
    ON analytics_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_path_created
    ON analytics_events(path, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_created
    ON analytics_events(visitor_id, created_at);
