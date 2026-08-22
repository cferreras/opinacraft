create extension if not exists pgcrypto;

create table if not exists monitor_targets (
  server_id uuid primary key,
  source_version varchar(512) not null default '0',
  publication_status varchar(20) not null default 'draft',
  moderation_status varchar(20) not null default 'active',
  availability_hidden_at timestamptz,
  network_host varchar(253) not null,
  cadence_minutes smallint not null check (cadence_minutes in (15, 60)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monitor_target_endpoints (
  server_id uuid not null references monitor_targets(server_id) on delete cascade,
  edition varchar(10) not null check (edition in ('java', 'bedrock')),
  history_source_id uuid not null default gen_random_uuid(),
  host varchar(253) not null,
  port integer not null check (port between 1024 and 65535),
  verification_status varchar(20) not null default 'unverified' check (verification_status in ('unverified', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (server_id, edition)
);

create table if not exists monitor_states (
  server_id uuid primary key references monitor_targets(server_id) on delete cascade,
  health_status varchar(20) not null default 'unknown' check (health_status in ('unknown', 'online', 'offline')),
  players_current integer,
  players_max integer,
  version varchar(100),
  latency_ms integer,
  last_checked_at timestamptz,
  last_online_at timestamptz,
  offline_since timestamptz,
  last_recovered_at timestamptz,
  last_state_change_at timestamptz,
  consecutive_failures smallint not null default 0,
  probe_edition varchar(10) check (probe_edition in ('java', 'bedrock')),
  updated_at timestamptz not null default now()
);

create table if not exists monitor_schedules (
  server_id uuid primary key references monitor_targets(server_id) on delete cascade,
  cadence_minutes smallint not null check (cadence_minutes in (15, 60)),
  next_due_at timestamptz not null,
  last_scheduled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists monitor_schedules_due_idx on monitor_schedules(next_due_at, server_id);

create table if not exists monitor_state_changes (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references monitor_targets(server_id) on delete cascade,
  from_status varchar(20) not null,
  to_status varchar(20) not null,
  occurred_at timestamptz not null,
  consecutive_failures smallint not null,
  created_at timestamptz not null default now()
);
create index if not exists monitor_state_changes_server_at_idx on monitor_state_changes(server_id, occurred_at desc);

create table if not exists monitor_player_snapshots (
  server_id uuid not null references monitor_targets(server_id) on delete cascade,
  scheduled_at timestamptz not null,
  observed_at timestamptz not null,
  probe_edition varchar(10) check (probe_edition in ('java', 'bedrock')),
  status varchar(20) not null check (status in ('unknown', 'online', 'offline')),
  failure_code varchar(30),
  players_current integer,
  players_max integer,
  version varchar(100),
  latency_ms integer,
  job_id varchar(160),
  primary key (server_id, scheduled_at)
);
create index if not exists monitor_player_snapshots_server_observed_idx on monitor_player_snapshots(server_id, observed_at);

create table if not exists monitor_player_hourly (
  server_id uuid not null references monitor_targets(server_id) on delete cascade,
  bucket_start timestamptz not null,
  last_probe_edition varchar(10),
  source_changed integer not null default 0,
  sample_count integer not null default 0,
  online_count integer not null default 0,
  unknown_count integer not null default 0,
  player_data_count integer not null default 0,
  players_total bigint not null default 0,
  players_peak integer,
  capacity_data_count integer not null default 0,
  capacity_total bigint not null default 0,
  capacity_latest integer,
  occupancy_data_count integer not null default 0,
  occupancy_basis_points_total bigint not null default 0,
  last_observed_at timestamptz,
  primary key (server_id, bucket_start)
);
create index if not exists monitor_player_hourly_server_bucket_idx on monitor_player_hourly(server_id, bucket_start);

create table if not exists monitor_business_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key varchar(255) not null unique,
  event_type varchar(80) not null,
  server_id uuid not null references monitor_targets(server_id) on delete cascade,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'pending' check (status in ('pending', 'processing', 'acked', 'failed')),
  attempts smallint not null default 0,
  lease_owner varchar(120),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists monitor_business_events_queue_idx on monitor_business_events(status, occurred_at);
create index if not exists monitor_business_events_lease_idx on monitor_business_events(lease_until);
