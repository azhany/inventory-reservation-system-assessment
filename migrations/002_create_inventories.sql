CREATE TABLE inventories (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  total_stock INTEGER NOT NULL CHECK (total_stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  sold_stock INTEGER NOT NULL DEFAULT 0 CHECK (sold_stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_capacity_check
    CHECK (reserved_stock + sold_stock <= total_stock)
);
