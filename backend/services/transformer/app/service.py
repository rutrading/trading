"""TransformerService - normalizes and enriches raw market data."""

import asyncio
import json
import logging

import grpc
from trading_lib.config import Config
from trading_lib.utils import safe_float

logger = logging.getLogger(__name__)


def _safe_pct(numerator: float, denominator: float) -> float:
    """Compute a percentage, returning 0 if denominator is zero."""
    if not denominator:
        return 0.0
    return round(numerator / denominator * 100, 2)


def _derive_signal(change_pct: float, volume_ratio: float, day_range_pct: float) -> str:
    """Derive a simple trading signal from indicators.

    Returns:
        "bullish" - positive change with high volume or price near day high
        "bearish" - negative change with high volume or price near day low
        "neutral" - everything else
    """
    if change_pct > 0 and (volume_ratio > 1.0 or day_range_pct > 66):
        return "bullish"
    if change_pct < 0 and (volume_ratio > 1.0 or day_range_pct < 33):
        return "bearish"
    return "neutral"


class TransformerServicer:
    """Normalizes and enriches raw market data with computed indicators."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def Transform(self, request, context):
        """Transform a raw quote into an enriched format.

        Adds computed fields:
        - day_range_pct: Where price is in today's range (0-100%)
        - fifty_two_week_pct: Where price is in 52-week range
        - gap_pct: Gap from previous close
        - volume_ratio: Current volume vs average
        - signal: bullish/bearish/neutral
        """
        from generated import transformer_pb2

        raw_quote = request.raw_quote
        raw = dict(raw_quote.raw)

        try:
            # Extract values from raw TwelveData response
            change = safe_float(raw, "change")
            change_percent = safe_float(raw, "percent_change")
            previous_close = safe_float(raw, "previous_close")
            average_volume = safe_float(raw, "average_volume")

            # Parse 52-week data (comes as nested JSON)
            ftw_low, ftw_high = 0.0, 0.0
            ftw_raw = raw.get("fifty_two_week", "")
            if ftw_raw and ftw_raw.startswith("{"):
                try:
                    ftw = json.loads(ftw_raw)
                    ftw_low = float(ftw.get("low", 0))
                    ftw_high = float(ftw.get("high", 0))
                except (json.JSONDecodeError, ValueError):
                    pass

            price = raw_quote.price
            high = raw_quote.high
            low = raw_quote.low
            open_ = raw_quote.open

            # Compute technical indicators
            day_range = high - low
            day_range_pct = _safe_pct(price - low, day_range)

            ftw_range = ftw_high - ftw_low
            fifty_two_week_pct = _safe_pct(price - ftw_low, ftw_range)

            gap_pct = (
                _safe_pct(open_ - previous_close, previous_close)
                if previous_close
                else 0.0
            )
            volume_ratio = (
                round(raw_quote.volume / average_volume, 2) if average_volume else 0.0
            )
            intraday_range_pct = _safe_pct(day_range, open_) if open_ else 0.0

            signal = _derive_signal(change_percent, volume_ratio, day_range_pct)

            logger.info(
                "Transformed %s: $%.2f %+.2f%% signal=%s",
                raw_quote.symbol,
                price,
                change_percent,
                signal,
            )

            return transformer_pb2.TransformResponse(
                symbol=raw_quote.symbol,
                price=price,
                change=round(change, 4),
                change_percent=round(change_percent, 4),
                open=open_,
                high=high,
                low=low,
                volume=raw_quote.volume,
                timestamp=raw_quote.timestamp,
                name=raw.get("name", ""),
                exchange=raw.get("exchange", ""),
                currency=raw.get("currency", ""),
                previous_close=previous_close,
                is_market_open=raw.get("is_market_open", "").lower() == "true",
                average_volume=average_volume,
                fifty_two_week_low=ftw_low,
                fifty_two_week_high=ftw_high,
                day_range_pct=day_range_pct,
                fifty_two_week_pct=fifty_two_week_pct,
                gap_pct=gap_pct,
                volume_ratio=volume_ratio,
                intraday_range_pct=intraday_range_pct,
                signal=signal,
                example="test",
            )

        except Exception as e:
            logger.error("Failed to transform %s: %s", raw_quote.symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return transformer_pb2.TransformResponse()

    async def BulkTransform(self, request, context):
        """Transform multiple quotes in parallel."""
        from generated import transformer_pb2

        tasks = [
            self.Transform(transformer_pb2.TransformRequest(raw_quote=rq), context)
            for rq in request.raw_quotes
        ]
        results = await asyncio.gather(*tasks)

        return transformer_pb2.BulkTransformResponse(quotes=results)
