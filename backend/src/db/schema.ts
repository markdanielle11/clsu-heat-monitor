/** Idempotent schema. Safe to run on every start (`npm run migrate`). */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash            text NOT NULL UNIQUE,   -- HMAC of the Expo push token (lookup only)
  token_enc             text NOT NULL,          -- AES-256-GCM encrypted Expo push token
  key_hash              text NOT NULL,          -- SHA-256 of the device API key
  platform              text NOT NULL DEFAULT 'ios',
  notifications_enabled boolean NOT NULL DEFAULT true,
  threshold_c           integer NOT NULL DEFAULT 42 CHECK (threshold_c BETWEEN 35 AND 52),
  notify_high           boolean NOT NULL DEFAULT true,
  notify_extreme        boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid')),
  invalid_reason        text,
  invalidated_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id         bigserial PRIMARY KEY,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source     text NOT NULL,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS forecast_snapshots_fetched_idx ON forecast_snapshots (fetched_at DESC);

-- Official PAGASA daily heat index forecast values for CLSU / Science City of Muñoz.
-- Filled only through the authenticated admin endpoint, never inferred or scraped.
CREATE TABLE IF NOT EXISTS official_daily (
  forecast_date date PRIMARY KEY,
  heat_index_c  integer NOT NULL CHECK (heat_index_c BETWEEN 0 AND 70),
  issued_at     timestamptz NOT NULL,
  station       text NOT NULL,
  source_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Last severity we notified a device about, per forecast day (drives de-duplication).
CREATE TABLE IF NOT EXISTS alert_state (
  device_id     uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  severity      text NOT NULL CHECK (severity IN ('high', 'extreme')),
  heat_index_c  integer NOT NULL,
  source_kind   text NOT NULL CHECK (source_kind IN ('official', 'estimated')),
  notified_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, forecast_date)
);

CREATE TABLE IF NOT EXISTS alerts (
  id                  bigserial PRIMARY KEY,
  device_id           uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  forecast_date       date NOT NULL,
  severity            text NOT NULL CHECK (severity IN ('high', 'extreme')),
  heat_index_c        integer NOT NULL,
  peak_time           timestamptz,
  source_kind         text NOT NULL CHECK (source_kind IN ('official', 'estimated')),
  reason              text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  status              text NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  ticket_id           text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  receipt_checked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS alerts_device_created_idx ON alerts (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_pending_receipts_idx ON alerts (created_at) WHERE status = 'sent' AND receipt_checked_at IS NULL;
`;
