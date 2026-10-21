from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal
from typing import Literal

CalculationPriority = Literal["normal", "media", "alta", "critica"]


@dataclass(frozen=True)
class ReplenishmentCalculation:
    average_daily_sales: Decimal
    lead_time_demand: int
    projected_quantity: int
    recommended_quantity: int
    priority: CalculationPriority
    reason: str


def calculate_replenishment(
    *,
    available_quantity: int,
    on_order_quantity: int,
    recent_sold_quantity: int,
    window_days: int,
    lead_time_days: int,
    minimum_stock: int,
    target_stock: int,
) -> ReplenishmentCalculation:
    """Calcula uma sugestão explicável sem depender de serviços externos."""
    average = (Decimal(recent_sold_quantity) / Decimal(window_days)).quantize(
        Decimal("0.01")
    )
    lead_time_demand = int(
        (Decimal(recent_sold_quantity) * Decimal(lead_time_days) / Decimal(window_days))
        .to_integral_value(rounding=ROUND_CEILING)
    )
    projected = available_quantity + on_order_quantity - lead_time_demand
    should_reorder = projected <= minimum_stock
    recommended = min(max(target_stock - projected, 0), 999999) if should_reorder else 0

    if recommended == 0:
        priority: CalculationPriority = "normal"
        reason = (
            f"Projeção de {projected} un. permanece acima do mínimo de "
            f"{minimum_stock} un."
        )
    elif available_quantity <= 0:
        priority = "critica"
        reason = (
            f"Saldo atual de {available_quantity} un.; recomposição até o alvo de "
            f"{target_stock} un."
        )
    elif projected <= 0:
        priority = "alta"
        reason = (
            f"Consumo previsto no prazo zera o saldo; projeção de {projected} un."
        )
    else:
        priority = "media"
        reason = (
            f"Projeção de {projected} un. ficará no mínimo de {minimum_stock} un. "
            "ou abaixo dele."
        )

    return ReplenishmentCalculation(
        average_daily_sales=average,
        lead_time_demand=lead_time_demand,
        projected_quantity=projected,
        recommended_quantity=recommended,
        priority=priority,
        reason=reason,
    )
