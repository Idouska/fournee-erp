create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  threshold numeric(12,2) not null default 0,
  minutes numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  stock numeric(12,3) not null default 0,
  threshold numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  sale_time text not null,
  product_id uuid references products(id) on delete set null,
  qty numeric(12,3) not null,
  price numeric(12,2) not null,
  cost numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  channel text not null default 'Boutique',
  payment text not null,
  created_at timestamptz not null default now()
);

create table productions (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  product_id uuid references products(id) on delete set null,
  qty numeric(12,3) not null,
  waste numeric(12,3) not null default 0,
  team text,
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  ingredient_id uuid references ingredients(id) on delete set null,
  qty numeric(12,3) not null,
  cost numeric(12,2) not null default 0,
  supplier text,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  due_date date not null,
  customer text not null,
  phone text,
  product text not null,
  total numeric(12,2) not null default 0,
  deposit numeric(12,2) not null default 0,
  status text not null default 'A preparer',
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  category text not null,
  amount numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table products enable row level security;
alter table ingredients enable row level security;
alter table sales enable row level security;
alter table productions enable row level security;
alter table purchases enable row level security;
alter table orders enable row level security;
alter table expenses enable row level security;
alter table settings enable row level security;
