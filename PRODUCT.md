# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the user: Python FastAPI API, React with Next.js frontend, PostgreSQL; all services run through Docker Compose.

## Users

Assumption based on the request: a person responsible for registering and maintaining product inventory.

## Product Purpose

Assumption based on the request: provide a simple interface to register products and review the existing catalog.

## Capabilities and Constraints

Confirmed: product, category, supplier, sale, and supplier purchase-order registration, plus a derived inventory position. Python FastAPI backend, React with Next.js frontend, PostgreSQL database, and Docker Compose are used. Categories support create, read, update, search, and delete; renames cascade to existing product records, while deletion is blocked for categories in use. Suppliers support create, read, update, search, and delete, with a unique document. Sales support multiple product items with quantities, price snapshots, calculated totals, search, editing, and deletion. Purchase orders support a supplier, multiple products, quantities, unit costs, expected delivery, status, notes, calculated totals, search, editing, and deletion. Inventory is calculated per product as quantities from received purchase orders minus quantities from sales; other purchase-order statuses do not add stock. A local replenishment agent uses 30 days of sales, supplier lead time, available stock, and open purchase orders to recommend quantities and create reviewable draft orders grouped by supplier. It does not use an external AI API. Replenishment policies require at least 10 units of minimum stock and a higher configurable target stock.

Assumed initial product fields: name, SKU, description, category, and price. Category fields are name and optional description. Confirmed exclusion: quantity is not part of the product record. Additional workflows are open decisions.
