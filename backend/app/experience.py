"""Shared source of truth for experience levels and their starting balances.

Mirrors web/src/lib/experience.ts. Keep the two in sync when adding or
renaming levels.
"""

from decimal import Decimal
from typing import Literal

ExperienceLevel = Literal["beginner", "intermediate", "advanced", "expert"]


class ExperienceOption:
    def __init__(
        self,
        value: ExperienceLevel,
        label: str,
        balance: str,
        starting_balance: Decimal,
        description: str,
    ):
        self.value = value
        self.label = label
        self.balance = balance
        self.starting_balance = starting_balance
        self.description = description

    def to_dict(self) -> dict[str, str]:
        return {
            "value": self.value,
            "label": self.label,
            "balance": self.balance,
            "starting_balance": str(self.starting_balance),
            "description": self.description,
        }


EXPERIENCE_OPTIONS: list[ExperienceOption] = [
    ExperienceOption(
        value="beginner",
        label="Beginner",
        balance="$100,000",
        starting_balance=Decimal("100000"),
        description="Start with more capital to learn without pressure.",
    ),
    ExperienceOption(
        value="intermediate",
        label="Intermediate",
        balance="$50,000",
        starting_balance=Decimal("50000"),
        description="A balanced starting point to build your strategy.",
    ),
    ExperienceOption(
        value="advanced",
        label="Advanced",
        balance="$25,000",
        starting_balance=Decimal("25000"),
        description="Less room for error, more room to grow.",
    ),
    ExperienceOption(
        value="expert",
        label="Expert",
        balance="$10,000",
        starting_balance=Decimal("10000"),
        description="Prove your skill with limited capital.",
    ),
]

BALANCE_MAP: dict[ExperienceLevel, Decimal] = {
    o.value: o.starting_balance for o in EXPERIENCE_OPTIONS
}
