export interface StockInfo {
  name: string;
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: string;
  marketCap: string;
  pe: number;
  week52High: number;
  week52Low: number;
  avgVolume: string;
}

export const STOCKS: Record<string, StockInfo> = {
  AAPL: { name: "Apple Inc.", price: 178.50, change: 2.34, open: 175.20, high: 179.80, low: 174.90, prevClose: 174.42, volume: "52.3M", marketCap: "2.78T", pe: 28.6, week52High: 199.62, week52Low: 143.90, avgVolume: "58.1M" },
  GOOGL: { name: "Alphabet Inc.", price: 155.80, change: -0.87, open: 157.10, high: 158.20, low: 154.90, prevClose: 157.17, volume: "28.1M", marketCap: "1.94T", pe: 25.2, week52High: 174.72, week52Low: 120.21, avgVolume: "32.4M" },
  AMZN: { name: "Amazon.com Inc.", price: 185.60, change: 1.52, open: 183.40, high: 187.40, low: 183.20, prevClose: 182.82, volume: "45.7M", marketCap: "1.92T", pe: 62.4, week52High: 201.20, week52Low: 144.05, avgVolume: "51.2M" },
  NVDA: { name: "NVIDIA Corporation", price: 880.30, change: 3.21, open: 865.00, high: 895.00, low: 862.50, prevClose: 852.91, volume: "38.9M", marketCap: "2.17T", pe: 72.1, week52High: 974.00, week52Low: 393.01, avgVolume: "42.6M" },
  MSFT: { name: "Microsoft Corporation", price: 415.20, change: 1.18, open: 412.50, high: 417.80, low: 411.30, prevClose: 410.36, volume: "22.4M", marketCap: "3.08T", pe: 36.8, week52High: 430.82, week52Low: 309.45, avgVolume: "25.8M" },
  META: { name: "Meta Platforms Inc.", price: 520.80, change: -1.15, open: 526.30, high: 528.40, low: 518.10, prevClose: 526.85, volume: "19.4M", marketCap: "1.33T", pe: 27.3, week52High: 542.81, week52Low: 341.50, avgVolume: "21.7M" },
  TSLA: { name: "Tesla Inc.", price: 195.40, change: -2.80, open: 200.10, high: 201.50, low: 194.20, prevClose: 201.02, volume: "89.2M", marketCap: "621B", pe: 48.9, week52High: 278.98, week52Low: 152.37, avgVolume: "95.3M" },
  NFLX: { name: "Netflix Inc.", price: 625.40, change: 0.78, open: 621.80, high: 631.20, low: 620.80, prevClose: 620.55, volume: "8.2M", marketCap: "271B", pe: 44.2, week52High: 639.00, week52Low: 395.49, avgVolume: "9.1M" },
  AMD: { name: "Advanced Micro Devices", price: 168.90, change: 4.56, open: 162.40, high: 172.30, low: 161.50, prevClose: 161.55, volume: "62.1M", marketCap: "273B", pe: 45.7, week52High: 227.30, week52Low: 136.56, avgVolume: "55.8M" },
  DIS: { name: "Walt Disney Company", price: 112.30, change: -0.42, open: 113.00, high: 113.80, low: 111.50, prevClose: 112.77, volume: "12.6M", marketCap: "205B", pe: 22.1, week52High: 123.74, week52Low: 83.91, avgVolume: "14.2M" },
};
