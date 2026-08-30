create table if not exists public.sesiones (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  tramite_slug text not null,
  paso_actual integer not null default 1,
  campos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.estadisticas (
  id uuid primary key default gen_random_uuid(),
  tramite_slug text not null,
  evento text not null check (evento in ('inicio', 'completado')),
  creado_en timestamptz not null default now()
);

create table if not exists public.papeleria_config (
  clave text primary key,
  valor text not null
);

alter table public.sesiones enable row level security;
alter table public.estadisticas enable row level security;
alter table public.papeleria_config enable row level security;

-- Las sesiones son anónimas y de corta duración: se identifican solo por un
-- token aleatorio generado en el navegador (no hay login), así que se
-- permite a cualquier cliente anónimo leer/escribir. Es información de baja
-- sensibilidad (paso actual y campos de un trámite en curso), nunca
-- contraseñas ni datos bancarios.
create policy "sesiones anon insert" on public.sesiones for insert to anon with check (true);
create policy "sesiones anon update" on public.sesiones for update to anon using (true);
create policy "sesiones anon select" on public.sesiones for select to anon using (true);

create policy "estadisticas anon insert" on public.estadisticas for insert to anon with check (true);

create policy "config anon select" on public.papeleria_config for select to anon using (true);
