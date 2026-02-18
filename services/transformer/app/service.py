"""TransformerService gRPC servicer implementation."""

import json
import logging

from trading_lib.config import Config

logger = logging.getLogger(__name__)


def _raw_float(raw: dict, key: str, fallback: float = 0.0) -> float:
    """Safely parse a float from the raw string map."""
    try:
        return float(raw.get(key, fallback))
    except (ValueError, TypeError):
        return fallback


def _safe_pct(numerator: float, denominator: float) -> float:
    """Compute a percentage, returning 0 if denominator is zero."""
    if not denominator:
        return 0.0
    return round(numerator / denominator * 100, 2)


def _derive_signal(change_pct: float, volume_ratio: float, day_range_pct: float) -> str:
    """Derive a simple trading signal from computed indicators.

    Rules:
      - bullish:  positive change AND (above-average volume OR price in upper third of day range)
      - bearish:  negative change AND (above-average volume OR price in lower third of day range)
      - neutral:  everything else
    """
    if change_pct > 0 and (volume_ratio > 1.0 or day_range_pct > 66):
        return "bullish"
    if change_pct < 0 and (volume_ratio > 1.0 or day_range_pct < 33):
        return "bearish"
    return "neutral"


class TransformerServicer:
    """Normalizes and enriches raw market data."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def Transform(self, request, context):
        """Transform a single raw quote into a normalized format."""
        from generated import transformer_pb2

        raw_quote = request.raw_quote
        raw = dict(raw_quote.raw)  # map<string,string> from market_data

        logger.info("Transforming %s", raw_quote.symbol)

        # --- Extract raw values from TwelveData ---
        change = _raw_float(raw, "change")
        change_percent = _raw_float(raw, "percent_change")
        previous_close = _raw_float(raw, "previous_close")
        average_volume = _raw_float(raw, "average_volume")

        # Parse fifty_two_week nested JSON (stored as string repr)
        ftw_low = 0.0
        ftw_high = 0.0
        ftw_raw = raw.get("fifty_two_week", "")
        if ftw_raw and ftw_raw.startswith("{"):
            try:
                ftw = json.loads(ftw_raw.replace("'", '"'))
                ftw_low = float(ftw.get("low", 0))
                ftw_high = float(ftw.get("high", 0))
            except (json.JSONDecodeError, ValueError):
                pass

        price = raw_quote.price
        high = raw_quote.high
        low = raw_quote.low
        open_ = raw_quote.open

        # --- Compute technical indicators ---

        # Where price sits in today's range (0% = at low, 100% = at high)
        day_range = high - low
        day_range_pct = _safe_pct(price - low, day_range)

        # Where price sits in the 52-week range
        ftw_range = ftw_high - ftw_low
        fifty_two_week_pct = _safe_pct(price - ftw_low, ftw_range)

        # Gap: how much did the open differ from yesterday's close
        gap_pct = (
            _safe_pct(open_ - previous_close, previous_close) if previous_close else 0.0
        )

        # Volume ratio: today's volume relative to average (>1 = above average)
        volume_ratio = (
            round(raw_quote.volume / average_volume, 2) if average_volume else 0.0
        )

        # Intraday volatility: day range as % of open price
        intraday_range_pct = _safe_pct(day_range, open_) if open_ else 0.0

        # --- Derive signal ---
        signal = _derive_signal(change_percent, volume_ratio, day_range_pct)

        result = transformer_pb2.TransformResponse(
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
            # Computed indicators
            day_range_pct=day_range_pct,
            fifty_two_week_pct=fifty_two_week_pct,
            gap_pct=gap_pct,
            volume_ratio=volume_ratio,
            intraday_range_pct=intraday_range_pct,
            signal=signal,
        )

        logger.info(
            "Transformed %s | $%.2f %+.2f%% | signal=%s day_range=%.0f%% 52w=%.0f%% gap=%+.2f%% vol_ratio=%.2f",
            result.symbol,
            result.price,
            result.change_percent,
            result.signal,
            result.day_range_pct,
            result.fifty_two_week_pct,
            result.gap_pct,
            result.volume_ratio,
        )

        return result

    async def BulkTransform(self, request, context):
        """Transform multiple raw quotes."""
        from generated import transformer_pb2

        results = []
        for raw_quote in request.raw_quotes:
            req = transformer_pb2.TransformRequest(raw_quote=raw_quote)
            result = await self.Transform(req, context)
            results.append(result)

        return transformer_pb2.BulkTransformResponse(quotes=results)
