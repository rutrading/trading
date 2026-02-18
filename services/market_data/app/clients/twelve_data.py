"""TwelveData REST API client."""

import httpx

from trading_lib.config import Config


class TwelveDataClient:
    """HTTP client for the TwelveData REST API."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.client = httpx.AsyncClient(
            base_url=config.twelve_data_base_url,
            timeout=10.0,
        )

    async def get_quote(self, symbol: str) -> dict:
        """Fetch a real-time quote for a single symbol."""
        response = await self.client.get(
            "/quote",
            params={
                "symbol": symbol.upper(),
                "apikey": self.config.twelve_data_api_key,
            },
        )
        response.raise_for_status()
        return response.json()

    async def get_quotes(self, symbols: list[str]) -> list[dict]:
        """Fetch quotes for multiple symbols."""
        results = []
        for symbol in symbols:
            data = await self.get_quote(symbol)
            results.append(data)
        return results

    async def close(self) -> None:
        await self.client.aclose()
