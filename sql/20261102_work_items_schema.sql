-- Server-side cache for connected-provider activity displayed on profiles.
-- Direct anon/authenticated access stays denied; the API reads and writes with
-- the service role and filters private rows by the authenticated owner.
create table public.work_items (
    id text not null,
    "userId" uuid not null references auth.users (id) on delete cascade,
    source text not null,
    type text not null,
    timestamp timestamptz not null,
    title text not null,
    description text not null default '',
    content jsonb not null default '{}'::jsonb,
    "codeSnippet" text,
    "previewUrl" text,
    "mediaUrl" text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint work_items_pkey primary key ("userId", id)
);

create index work_items_user_timestamp_idx
    on public.work_items ("userId", timestamp desc);

alter table public.work_items enable row level security;

revoke all on table public.work_items from public, anon, authenticated;
grant select, insert, update, delete on table public.work_items to service_role;

notify pgrst, 'reload schema';
