import { type Inventory } from '../api/inventory-api';

type InventorySummaryProps = Readonly<{
  inventory: Inventory;
}>;

type StockValueProps = Readonly<{
  label: string;
  name: string;
  value: number;
}>;

function StockValue({ label, name, value }: StockValueProps) {
  const valueId = `${name}-stock-value`;

  return (
    <div className={`stock-value stock-value--${name}`}>
      <dt aria-describedby={valueId}>{label}</dt>
      <dd id={valueId}>{value}</dd>
    </div>
  );
}

export function InventorySummary({ inventory }: InventorySummaryProps) {
  return (
    <section className="panel inventory-panel" aria-labelledby="inventory-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live counters</p>
          <h2 id="inventory-title">Inventory</h2>
        </div>
        <span className="connection-status">Connected</span>
      </div>

      <dl className="stock-grid">
        <StockValue label="Total stock" name="total" value={inventory.totalStock} />
        <StockValue label="Available" name="available" value={inventory.availableStock} />
        <StockValue label="Reserved" name="reserved" value={inventory.reservedStock} />
        <StockValue label="Sold" name="sold" value={inventory.soldStock} />
      </dl>
    </section>
  );
}
