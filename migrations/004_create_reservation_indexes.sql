CREATE INDEX reservations_product_status_idx
  ON reservations(product_id, status);

CREATE INDEX reservations_expiry_idx
  ON reservations(product_id, status, expires_at)
  WHERE status = 'ACTIVE';
