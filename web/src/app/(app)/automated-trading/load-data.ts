import { getAccounts } from "@/app/actions/auth";
import {
  getStrategyCatalog,
  getStrategies,
  getStrategyRuns,
  getStrategySnapshot,
} from "@/app/actions/strategies";
import { getHoldings, getPortfolioTimeSeries } from "@/app/actions/portfolio";

export async function loadAutomatedTradingData() {
  const accounts = await getAccounts();
  const investmentAccounts = accounts
    .map((member) => member.tradingAccount)
    .filter((account) => account.type === "investment")
    .map((account) => ({ id: account.id, name: account.name }));

  const initialAccountId = investmentAccounts[0]?.id ?? null;
  if (!initialAccountId) {
    return {
      accounts: investmentAccounts,
      initialAccountId,
      initialStrategies: [],
      initialRuns: [],
      initialSnapshot: null,
      initialCatalog: [],
      initialPortfolio: {
        data: [],
        totalCash: 0,
        tickerQuantities: {},
        liveValue: null,
      },
    };
  }

  const [catalogRes, strategiesRes, runsRes, snapshotRes, holdingsRes] =
    await Promise.all([
      getStrategyCatalog(),
      getStrategies(initialAccountId),
      getStrategyRuns(initialAccountId),
      getStrategySnapshot(initialAccountId),
      getHoldings(initialAccountId),
    ]);

  const tickerQuantities: Record<string, string> = {};
  const totalCash = holdingsRes.ok ? Number(holdingsRes.data.cash_balance) : 0;
  const holdings = holdingsRes.ok
    ? holdingsRes.data.holdings.map((holding) => ({
        ...holding,
        trading_account_id: initialAccountId,
      }))
    : [];
  for (const holding of holdings) {
    const available = Math.max(
      0,
      Number(holding.quantity) - Number(holding.reserved_quantity),
    );
    tickerQuantities[holding.ticker] = String(available);
  }

  const portfolioData = await getPortfolioTimeSeries(holdings, totalCash, 30);

  return {
    accounts: investmentAccounts,
    initialAccountId,
    initialStrategies: strategiesRes.ok ? strategiesRes.data.strategies : [],
    initialRuns: runsRes.ok ? runsRes.data.runs : [],
    initialSnapshot: snapshotRes.ok ? snapshotRes.data : null,
    initialCatalog: catalogRes.ok ? catalogRes.data.templates : [],
    initialPortfolio: {
      data: portfolioData,
      totalCash,
      tickerQuantities,
      liveValue: null,
    },
  };
}
