import unittest

from replenishment import calculate_replenishment


class ReplenishmentCalculationTest(unittest.TestCase):
    def test_recommends_enough_for_lead_time_and_target(self):
        result = calculate_replenishment(
            available_quantity=8,
            on_order_quantity=0,
            recent_sold_quantity=30,
            window_days=30,
            lead_time_days=7,
            minimum_stock=5,
            target_stock=20,
        )

        self.assertEqual(result.lead_time_demand, 7)
        self.assertEqual(result.projected_quantity, 1)
        self.assertEqual(result.recommended_quantity, 19)
        self.assertEqual(result.priority, "media")

    def test_open_orders_prevent_duplicate_replenishment(self):
        result = calculate_replenishment(
            available_quantity=8,
            on_order_quantity=20,
            recent_sold_quantity=30,
            window_days=30,
            lead_time_days=7,
            minimum_stock=5,
            target_stock=20,
        )

        self.assertEqual(result.recommended_quantity, 0)
        self.assertEqual(result.priority, "normal")

    def test_negative_stock_is_critical(self):
        result = calculate_replenishment(
            available_quantity=-3,
            on_order_quantity=0,
            recent_sold_quantity=0,
            window_days=30,
            lead_time_days=3,
            minimum_stock=2,
            target_stock=10,
        )

        self.assertEqual(result.recommended_quantity, 13)
        self.assertEqual(result.priority, "critica")

    def test_recommendation_respects_purchase_order_limit(self):
        result = calculate_replenishment(
            available_quantity=-999999,
            on_order_quantity=0,
            recent_sold_quantity=999999,
            window_days=30,
            lead_time_days=365,
            minimum_stock=10,
            target_stock=999999,
        )

        self.assertEqual(result.recommended_quantity, 999999)


if __name__ == "__main__":
    unittest.main()
