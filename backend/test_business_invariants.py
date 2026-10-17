import os
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import main


class BusinessInvariantTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        main.Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_editing_sale_preserves_existing_price_snapshot(self):
        original = main.Product(
            name="Produto antigo", sku="OLD-1", category="Geral", price=Decimal("25.00")
        )
        added = main.Product(
            name="Produto novo", sku="NEW-1", category="Geral", price=Decimal("8.50")
        )
        sale = main.Sale(customer_name="Cliente", notes=None)
        self.session.add_all([original, added, sale])
        self.session.flush()
        sale.items = [
            main.SaleItem(
                product_id=original.id,
                product_name=original.name,
                product_sku=original.sku,
                quantity=2,
                unit_price=Decimal("10.00"),
            )
        ]
        self.session.commit()

        payload = main.SaleUpdate(
            customer_name="Cliente atualizado",
            notes="Correção cadastral",
            items=[
                main.SaleItemInput(product_id=original.id, quantity=3),
                main.SaleItemInput(product_id=added.id, quantity=1),
            ],
        )
        with patch.object(main, "create_replenishment_orders", return_value=None):
            result = main.update_sale(sale.id, payload, self.session, None)

        self.assertEqual(result.items[0].unit_price, Decimal("10.00"))
        self.assertEqual(result.items[0].subtotal, Decimal("30.00"))
        self.assertEqual(result.items[1].unit_price, Decimal("8.50"))
        self.assertEqual(result.total, Decimal("38.50"))

    def _received_order(self):
        supplier = main.Supplier(name="Fornecedor", document="DOC-1")
        order = main.PurchaseOrder(
            supplier_name="Fornecedor",
            supplier_document="DOC-1",
            status="recebido",
            expected_date=date(2026, 10, 17),
        )
        self.session.add_all([supplier, order])
        self.session.flush()
        order.supplier_id = supplier.id
        order.items = []
        self.session.commit()
        return order

    def test_received_purchase_order_cannot_be_updated(self):
        order = self._received_order()
        payload = main.PurchaseOrderUpdate(
            supplier_id=order.supplier_id,
            status="rascunho",
            items=[
                main.PurchaseOrderItemInput(
                    product_id=1, quantity=1, unit_cost=Decimal("1.00")
                )
            ],
        )

        with self.assertRaises(HTTPException) as error:
            main.update_purchase_order(order.id, payload, self.session, None)

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.session.get(main.PurchaseOrder, order.id).status, "recebido")

    def test_received_purchase_order_cannot_be_deleted(self):
        order = self._received_order()

        with self.assertRaises(HTTPException) as error:
            main.delete_purchase_order(order.id, self.session, None)

        self.assertEqual(error.exception.status_code, 409)
        self.assertIsNotNone(self.session.get(main.PurchaseOrder, order.id))


if __name__ == "__main__":
    unittest.main()
