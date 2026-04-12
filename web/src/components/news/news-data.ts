export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  symbol: string | null;
  url: string;
}

export const SYMBOLS = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "NVDA", name: "NVIDIA Corporation" },
  { ticker: "TSLA", name: "Tesla Inc." },
  { ticker: "MSFT", name: "Microsoft Corporation" },
  { ticker: "AMZN", name: "Amazon.com Inc." },
  { ticker: "GOOGL", name: "Alphabet Inc." },
  { ticker: "META", name: "Meta Platforms Inc." },
] as const;

export const NEWS_ITEMS: NewsItem[] = [
  {
    headline: "Apple reports record Q1 earnings, beats expectations",
    summary:
      "Apple posted revenue of $124B in Q1 2026, driven by strong iPhone and Services growth across all regions.",
    source: "Reuters",
    timestamp: "2h ago",
    symbol: "AAPL",
    url: "#",
  },
  {
    headline: "Apple Vision Pro 2 enters mass production",
    summary:
      "The next-gen headset features a lighter design and improved hand tracking, with shipments expected in Q3.",
    source: "9to5Mac",
    timestamp: "4h ago",
    symbol: "AAPL",
    url: "#",
  },
  {
    headline: "NVIDIA unveils next-gen AI chip architecture",
    summary:
      "The new Blackwell Ultra platform promises 4x inference throughput over current generation at the same power envelope.",
    source: "CNBC",
    timestamp: "5h ago",
    symbol: "NVDA",
    url: "#",
  },
  {
    headline: "NVIDIA partners with major cloud providers on new AI clusters",
    summary:
      "AWS, Azure, and GCP will deploy Blackwell Ultra-based instances starting next quarter.",
    source: "The Verge",
    timestamp: "7h ago",
    symbol: "NVDA",
    url: "#",
  },
  {
    headline: "Tesla deliveries exceed analyst predictions for Q1 2026",
    summary:
      "Tesla delivered 495,000 vehicles in Q1, beating consensus estimates of 460,000 as new Model 2 ramps production.",
    source: "MarketWatch",
    timestamp: "6h ago",
    symbol: "TSLA",
    url: "#",
  },
  {
    headline: "Tesla expands Supercharger network to 75,000 stations",
    summary:
      "The expansion solidifies Tesla's charging dominance as competing networks struggle with reliability issues.",
    source: "Electrek",
    timestamp: "10h ago",
    symbol: "TSLA",
    url: "#",
  },
  {
    headline: "Microsoft Azure revenue grows 35% year-over-year",
    summary:
      "Cloud division continues to outpace competitors with AI workload demand driving adoption across enterprise customers.",
    source: "WSJ",
    timestamp: "8h ago",
    symbol: "MSFT",
    url: "#",
  },
  {
    headline: "Amazon announces $10B investment in AI infrastructure",
    summary:
      "The investment will fund new data centers and custom chip development to compete with Microsoft and Google in cloud AI.",
    source: "TechCrunch",
    timestamp: "12h ago",
    symbol: "AMZN",
    url: "#",
  },
  {
    headline: "Alphabet reports Search ad revenue up 18% in Q1",
    summary:
      "Google Search and YouTube advertising revenue exceeded expectations, driven by AI-powered ad targeting improvements.",
    source: "Bloomberg",
    timestamp: "9h ago",
    symbol: "GOOGL",
    url: "#",
  },
  {
    headline: "Meta launches AI-powered business messaging platform",
    summary:
      "The new platform integrates across WhatsApp, Messenger, and Instagram to help businesses automate customer interactions.",
    source: "Reuters",
    timestamp: "11h ago",
    symbol: "META",
    url: "#",
  },
  {
    headline: "Fed signals potential rate cut in upcoming meeting",
    summary:
      "Federal Reserve officials hinted at a possible 25bps rate reduction citing slowing inflation and labor market cooling.",
    source: "Bloomberg",
    timestamp: "3h ago",
    symbol: null,
    url: "#",
  },
];
