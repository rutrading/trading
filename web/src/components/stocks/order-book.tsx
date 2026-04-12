const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORDER_BOOK_ASKS = [
  { price: 179.20, size: 1200, total: "215K" },
  { price: 179.00, size: 850, total: "153K" },
  { price: 178.80, size: 2100, total: "376K" },
  { price: 178.70, size: 450, total: "81K" },
];

const ORDER_BOOK_BIDS = [
  { price: 178.40, size: 1800, total: "321K" },
  { price: 178.20, size: 950, total: "169K" },
  { price: 178.00, size: 3200, total: "570K" },
  { price: 177.80, size: 600, total: "107K" },
];

export const OrderBook = ({ price }: { price: number }) => {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Order Book</h2>
      <div className="space-y-1 rounded-xl bg-card p-4">
        <div className="mb-2 grid grid-cols-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {ORDER_BOOK_ASKS.slice().reverse().map((row, i) => (
          <div key={`ask-${i}`} className="grid grid-cols-3 py-0.5 text-xs tabular-nums">
            <span className="text-red-500">${fmt(row.price)}</span>
            <span className="text-right text-muted-foreground">{row.size.toLocaleString()}</span>
            <span className="text-right text-muted-foreground">{row.total}</span>
          </div>
        ))}

        <div className="my-2 flex items-center justify-center gap-2 rounded-md bg-muted py-1.5 text-xs font-semibold tabular-nums">
          ${fmt(price)}
          <span className="text-[10px] text-muted-foreground">LAST PRICE</span>
        </div>

        {ORDER_BOOK_BIDS.map((row, i) => (
          <div key={`bid-${i}`} className="grid grid-cols-3 py-0.5 text-xs tabular-nums">
            <span className="text-emerald-500">${fmt(row.price)}</span>
            <span className="text-right text-muted-foreground">{row.size.toLocaleString()}</span>
            <span className="text-right text-muted-foreground">{row.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
