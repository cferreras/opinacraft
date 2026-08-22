create extension if not exists pgcrypto;
alter table monitor_targets alter column source_version type varchar(512);
