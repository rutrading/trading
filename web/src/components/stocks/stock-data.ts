export interface StockInfo {
  name: string;
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
}

export const STOCKS: Record<string, StockInfo> = {
  AAPL: { name: "Apple Inc.", price: 178.50, change: 2.34, open: 175.20, high: 179.80, low: 174.90, prevClose: 174.42, volume: 52_300_000 },
  GOOGL: { name: "Alphabet Inc.", price: 155.80, change: -0.87, open: 157.10, high: 158.20, low: 154.90, prevClose: 157.17, volume: 28_100_000 },
  AMZN: { name: "Amazon.com Inc.", price: 185.60, change: 1.52, open: 183.40, high: 187.40, low: 183.20, prevClose: 182.82, volume: 45_700_000 },
  NVDA: { name: "NVIDIA Corporation", price: 880.30, change: 3.21, open: 865.00, high: 895.00, low: 862.50, prevClose: 852.91, volume: 38_900_000 },
  MSFT: { name: "Microsoft Corporation", price: 415.20, change: 1.18, open: 412.50, high: 417.80, low: 411.30, prevClose: 410.36, volume: 22_400_000 },
  META: { name: "Meta Platforms Inc.", price: 520.80, change: -1.15, open: 526.30, high: 528.40, low: 518.10, prevClose: 526.85, volume: 19_400_000 },
  TSLA: { name: "Tesla Inc.", price: 195.40, change: -2.80, open: 200.10, high: 201.50, low: 194.20, prevClose: 201.02, volume: 89_200_000 },
  NFLX: { name: "Netflix Inc.", price: 625.40, change: 0.78, open: 621.80, high: 631.20, low: 620.80, prevClose: 620.55, volume: 8_200_000 },
  AMD: { name: "Advanced Micro Devices", price: 168.90, change: 4.56, open: 162.40, high: 172.30, low: 161.50, prevClose: 161.55, volume: 62_100_000 },
  DIS: { name: "Walt Disney Company", price: 112.30, change: -0.42, open: 113.00, high: 113.80, low: 111.50, prevClose: 112.77, volume: 12_600_000 },
};
