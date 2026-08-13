# Papelería Arcoíris - Supabase schema

-- Tables: usuarios, tramites, historial

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  email text,
  created_at timestamptz default now()
);

create table if not exists tramites (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  titulo text,
  datos jsonb,
  created_at timestamptz default now()
);

create table if not exists historial (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id),
  tramite_id uuid references tramites(id),
  nota text,
  created_at timestamptz default now()
);
