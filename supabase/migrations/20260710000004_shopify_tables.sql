-- M4: products / variants(Shopifyキャッシュ+手動商品)、watched_coupons / coupon_orders(クーポン注文連携)
-- 仕様書 v1.8 5章。campaign_idはM5でcampaignsテーブルができてからFK制約を追加する。

create type coupon_order_status as enum ('pending', 'converted', 'skipped');

create table products (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id text unique,
  title text not null,
  brand text,
  image_url text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  shopify_variant_id text unique,
  sku text,
  size text,
  color text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table watched_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table coupon_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  order_no text not null,
  ordered_at timestamptz not null,
  coupon_code text not null,
  customer_name text,
  customer_email text,
  shopify_customer_id text,
  line_items jsonb not null default '[]'::jsonb,
  monitor_id uuid references profiles (id) on delete set null,
  status coupon_order_status not null default 'pending',
  campaign_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index variants_product_id_idx on variants (product_id);
create index coupon_orders_monitor_id_idx on coupon_orders (monitor_id);
create index coupon_orders_status_idx on coupon_orders (status);

create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();
create trigger variants_set_updated_at before update on variants
  for each row execute function set_updated_at();
create trigger watched_coupons_set_updated_at before update on watched_coupons
  for each row execute function set_updated_at();
create trigger coupon_orders_set_updated_at before update on coupon_orders
  for each row execute function set_updated_at();

alter table products enable row level security;
alter table variants enable row level security;
alter table watched_coupons enable row level security;
alter table coupon_orders enable row level security;

create policy "staff/admin can manage products" on products
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can manage variants" on variants
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can manage watched_coupons" on watched_coupons
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can manage coupon_orders" on coupon_orders
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));
