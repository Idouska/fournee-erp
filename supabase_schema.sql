create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  threshold numeric(12,2) not null default 0,
  minutes numeric(12,2) not null default 0,
  photo text,
  recipe jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  stock numeric(12,3) not null default 0,
  threshold numeric(12,3) not null default 0,
  sensitive boolean not null default false,
  dlc date,
  storage text not null default 'Ambiant',
  temp numeric(6,2),
  created_at timestamptz not null default now()
);

create table sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  goal numeric(12,2) not null default 0,
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
  seller_id uuid references sellers(id) on delete set null,
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
  dlc date,
  temp numeric(6,2),
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  movement_time text,
  ingredient_id uuid references ingredients(id) on delete set null,
  qty numeric(12,3) not null,
  type text not null,
  reason text,
  ref text,
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

create table documents (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  business_date date not null,
  type text not null,
  customer text not null,
  order_id uuid references orders(id) on delete set null,
  amount numeric(12,2) not null default 0,
  status text not null default 'Brouillon',
  note text,
  created_at timestamptz not null default now()
);

create table settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table erp_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table products enable row level security;
alter table ingredients enable row level security;
alter table sellers enable row level security;
alter table sales enable row level security;
alter table productions enable row level security;
alter table purchases enable row level security;
alter table stock_movements enable row level security;
alter table orders enable row level security;
alter table expenses enable row level security;
alter table documents enable row level security;
alter table settings enable row level security;
alter table erp_state enable row level security;

create policy "Users can read their ERP state"
on erp_state for select
using (auth.uid() = user_id);

create policy "Users can insert their ERP state"
on erp_state for insert
with check (auth.uid() = user_id);

create policy "Users can update their ERP state"
on erp_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their ERP state"
on erp_state for delete
using (auth.uid() = user_id);
