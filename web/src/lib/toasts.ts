import { toastManager } from "@/components/ui/toast";

type Side = "buy" | "sell";

/**
 * Trade-related toast helpers.
 * Import and call these from any client component:
 *
 *   import { toast } from "@/lib/toasts";
 *   toast.orderPlaced("AAPL", 10, "buy");
 */
export const toast = {
  orderPlaced(ticker: string, quantity: number, side: Side) {
    const verb = side === "buy" ? "Buy" : "Sell";
    toastManager.add({
      title: `${verb} order placed`,
      description: `${quantity} ${quantity === 1 ? "share" : "shares"} of ${ticker}`,
      type: "info",
    });
  },

  orderFilled(ticker: string, quantity: number, side: Side, price: number) {
    const verb = side === "buy" ? "Bought" : "Sold";
    toastManager.add({
      title: `${verb} ${quantity} ${quantity === 1 ? "share" : "shares"} of ${ticker}`,
      description: `Filled at $${price.toFixed(2)}`,
      type: "success",
    });
  },

  orderRejected(ticker: string, reason?: string) {
    toastManager.add({
      title: `Order for ${ticker} rejected`,
      description: reason ?? "Please try again.",
      type: "error",
    });
  },

  orderCancelled(ticker: string) {
    toastManager.add({
      title: `Order for ${ticker} cancelled`,
      type: "warning",
    });
  },

  accountCreated(name: string) {
    toastManager.add({
      title: "Account created",
      description: name,
      type: "success",
    });
  },

  error(title: string, description?: string) {
    toastManager.add({ title, description, type: "error" });
  },

  success(title: string, description?: string) {
    toastManager.add({ title, description, type: "success" });
  },

  info(title: string, description?: string) {
    toastManager.add({ title, description, type: "info" });
  },
};
