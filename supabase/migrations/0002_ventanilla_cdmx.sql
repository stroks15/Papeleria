-- Ventanilla Digital de Trámites Rápidos CDMX
-- Tablas: consultas_vehiculares (tenencia / verificación por placa) y
-- tramites_personales (actas del Registro Civil, vía WebView).
--
-- Modelo de seguridad:
--   * El backend (Next.js en Vercel) usa la llave service_role, que omite RLS,
--     para TODA escritura. anon/authenticated no pueden insertar, actualizar
--     ni borrar nada.
--   * consultas_vehiculares: lectura pública (anon) solo de columnas no
--     sensibles; idempotency_key e intentos NO se exponen.
--   * tramites_personales: SIN acceso para anon/authenticated (contiene folios
--     y huellas de documentos personales). Solo service_role. Todo dato enviado
--     por la app (cliente no confiable) aterriza aquí, nunca en la tabla pública:
--     así nadie puede envenenar lo que lee anon.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.ventanilla_touch_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- consultas_vehiculares
-- ---------------------------------------------------------------------------
create table if not exists public.consultas_vehiculares (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('tenencia', 'verificacion')),
  placa           text not null check (placa ~ '^[A-Z0-9]{5,8}$'),
  -- pendiente: hay una petición en vuelo (o se perdió la respuesta)
  -- ok: el scraper o el WebView obtuvo el dato
  -- requires_fallback: el portal exige reCAPTCHA/WAF -> usar WebView
  -- unknown: timeout; no se sabe si el portal procesó la petición. NO reintentar de inmediato
  -- error: fallo propio (configuración, autenticación del scraper, etc.)
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'ok', 'requires_fallback', 'unknown', 'error')),
  idempotency_key text not null,
  resultado       jsonb not null default '{}'::jsonb,
  motivo          text check (motivo is null or char_length(motivo) <= 200),
  fuente          text not null default 'scraper' check (fuente in ('scraper', 'webview')),
  pdf_url         text check (pdf_url is null or char_length(pdf_url) <= 500),
  intentos        integer not null default 0 check (intentos >= 0),
  consultado_en   timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  -- Una fila por placa y tipo de consulta: evita colisiones y duplicados.
  constraint consultas_vehiculares_placa_tipo_key unique (placa, tipo),
  constraint consultas_vehiculares_idempotency_key_key unique (idempotency_key)
);

comment on table public.consultas_vehiculares is
  'Última consulta de tenencia/verificación por placa. Escritura solo por service_role.';

drop trigger if exists consultas_vehiculares_touch on public.consultas_vehiculares;
create trigger consultas_vehiculares_touch
  before update on public.consultas_vehiculares
  for each row execute function public.ventanilla_touch_actualizado_en();

alter table public.consultas_vehiculares enable row level security;

revoke all on public.consultas_vehiculares from anon, authenticated;
-- Permiso por columna: anon no ve idempotency_key ni intentos.
grant select (id, tipo, placa, estado, resultado, motivo, fuente, pdf_url, consultado_en, actualizado_en)
  on public.consultas_vehiculares to anon;

drop policy if exists "consultas_vehiculares anon select" on public.consultas_vehiculares;
create policy "consultas_vehiculares anon select"
  on public.consultas_vehiculares
  for select
  to anon
  using (true);
-- Sin políticas de insert/update/delete: solo service_role (omite RLS).

-- ---------------------------------------------------------------------------
-- tramites_personales (actas del Registro Civil y PDFs capturados en el WebView)
-- ---------------------------------------------------------------------------
create table if not exists public.tramites_personales (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null
                  check (tipo in ('acta_nacimiento', 'acta_matrimonio', 'tenencia_pdf', 'verificacion_pdf')),
  -- Solo para tenencia_pdf / verificacion_pdf.
  placa           text check (placa is null or placa ~ '^[A-Z0-9]{5,8}$'),
  -- El folio lo genera el portal; es NULL hasta que se captura.
  folio           text check (folio is null or folio ~ '^[A-Za-z0-9._-]{4,64}$'),
  -- UUID anónimo del dispositivo (el mismo que usa la tabla sesiones).
  session_id      text not null check (char_length(session_id) between 8 and 64),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'en_portal', 'completado', 'unknown', 'error')),
  -- Generada por la app en cada intento; hace seguro reintentar el POST.
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  -- Solo origen + ruta: se descartan los parámetros de consulta (pueden traer tokens).
  pdf_url         text check (pdf_url is null or char_length(pdf_url) <= 500),
  pdf_sha256      text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes       integer check (pdf_bytes is null or pdf_bytes >= 0),
  metadatos       jsonb not null default '{}'::jsonb,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint tramites_personales_idempotency_key_key unique (idempotency_key)
);

-- Un folio no puede repetirse dentro del mismo tipo de acta.
create unique index if not exists tramites_personales_tipo_folio_key
  on public.tramites_personales (tipo, folio)
  where folio is not null;

create index if not exists tramites_personales_session_idx
  on public.tramites_personales (session_id, creado_en desc);

comment on table public.tramites_personales is
  'Metadatos de PDFs capturados en el WebView (actas, tenencia, verificación). Sin acceso anon: solo service_role. No guardar CURP ni datos del acta.';

drop trigger if exists tramites_personales_touch on public.tramites_personales;
create trigger tramites_personales_touch
  before update on public.tramites_personales
  for each row execute function public.ventanilla_touch_actualizado_en();

alter table public.tramites_personales enable row level security;
revoke all on public.tramites_personales from anon, authenticated;
-- Sin políticas: con RLS activo, anon/authenticated no ven ni escriben nada.

-- ---------------------------------------------------------------------------
-- Reclamo atómico de una consulta (idempotencia)
-- ---------------------------------------------------------------------------
-- Decide, bajo bloqueo de fila, si ESTA petición puede llamar al portal del
-- gobierno o si debe devolver lo que ya existe. Así dos peticiones simultáneas
-- (o un reintento tras timeout) nunca duplican la consulta externa.
create or replace function public.ventanilla_reclamar_consulta(
  p_tipo     text,
  p_placa    text,
  p_key      text,
  p_ttl_ok   interval default interval '6 hours',
  p_lock     interval default interval '90 seconds',
  p_cooldown interval default interval '10 minutes'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.consultas_vehiculares%rowtype;
begin
  insert into public.consultas_vehiculares as c
    (tipo, placa, idempotency_key, estado, intentos, consultado_en)
  values
    (p_tipo, p_placa, p_key, 'pendiente', 1, now())
  on conflict (placa, tipo) do nothing
  returning c.* into r;

  if found then
    return jsonb_build_object('reclamada', true, 'fila', to_jsonb(r));
  end if;

  select c.* into r
    from public.consultas_vehiculares c
   where c.placa = p_placa and c.tipo = p_tipo
     for update;

  if (r.estado = 'ok' and r.actualizado_en > now() - p_ttl_ok)
     or (r.estado = 'pendiente' and r.actualizado_en > now() - p_lock)
     or (r.estado in ('unknown', 'requires_fallback', 'error') and r.actualizado_en > now() - p_cooldown)
  then
    return jsonb_build_object('reclamada', false, 'fila', to_jsonb(r));
  end if;

  update public.consultas_vehiculares c
     set estado = 'pendiente',
         idempotency_key = p_key,
         intentos = c.intentos + 1,
         consultado_en = now(),
         motivo = null
   where c.id = r.id
  returning c.* into r;

  return jsonb_build_object('reclamada', true, 'fila', to_jsonb(r));
end;
$$;

revoke all on function public.ventanilla_reclamar_consulta(text, text, text, interval, interval, interval)
  from public, anon, authenticated;
grant execute on function public.ventanilla_reclamar_consulta(text, text, text, interval, interval, interval)
  to service_role;
