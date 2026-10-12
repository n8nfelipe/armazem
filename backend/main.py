import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

import jwt
from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, create_engine, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, selectinload, sessionmaker

from replenishment import calculate_replenishment

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://estoque:estoque@localhost:5432/estoque"
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
JWT_SECRET = os.getenv("JWT_SECRET")
if not ADMIN_PASSWORD or not JWT_SECRET:
    raise RuntimeError("ADMIN_PASSWORD e JWT_SECRET precisam ser definidos no arquivo .env")

ACCESS_TOKEN_MINUTES = 60 * 12
AUTH_COOKIE = "estoque_session"
password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("usuario-inexistente")
AGENT_PROVIDER = os.getenv("AGENT_PROVIDER", "local").strip().lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
    ).split(",")
    if origin.strip()
]


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    document: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", lazy="selectin"
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_name: Mapped[str] = mapped_column(String(120), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    sale: Mapped[Sale] = relationship(back_populates="items")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    supplier_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    supplier_document: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    expected_date: Mapped[date | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_name: Mapped[str] = mapped_column(String(120), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    order: Mapped[PurchaseOrder] = relationship(back_populates="items")


class ReplenishmentPolicy(Base):
    __tablename__ = "replenishment_policies"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    minimum_stock: Mapped[int] = mapped_column(Integer, nullable=False)
    target_stock: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ProductFields(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    sku: str = Field(min_length=2, max_length=40)
    description: str | None = Field(default=None, max_length=2000)
    category: str = Field(min_length=2, max_length=80)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)

    @field_validator("name", "sku", "category")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo é obrigatório")
        return value

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None


class ProductCreate(ProductFields):
    pass


class ProductUpdate(ProductFields):
    pass


class ProductRead(ProductFields):
    model_config = ConfigDict(from_attributes=True)
    id: int


class CategoryFields(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo é obrigatório")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None


class CategoryCreate(CategoryFields):
    pass


class CategoryUpdate(CategoryFields):
    pass


class CategoryRead(CategoryFields):
    id: int
    product_count: int


class SupplierFields(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    document: str = Field(min_length=3, max_length=30)
    contact_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "document")
    @classmethod
    def trim_required_supplier_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo é obrigatório")
        return value

    @field_validator("document")
    @classmethod
    def normalize_document(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("contact_name", "email", "phone", "address", "notes")
    @classmethod
    def normalize_optional_supplier_text(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value and ("@" not in value or "." not in value.rsplit("@", 1)[-1]):
            raise ValueError("Informe um e-mail válido")
        return value.lower() if value else None


class SupplierCreate(SupplierFields):
    pass


class SupplierUpdate(SupplierFields):
    pass


class SupplierRead(SupplierFields):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SaleItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=9999)


class SaleFields(BaseModel):
    customer_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[SaleItemInput] = Field(min_length=1, max_length=100)

    @field_validator("customer_name", "notes")
    @classmethod
    def normalize_optional_sale_text(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None

    @field_validator("items")
    @classmethod
    def ensure_unique_products(cls, value: list[SaleItemInput]) -> list[SaleItemInput]:
        product_ids = [item.product_id for item in value]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Um produto não pode aparecer mais de uma vez na venda")
        return value


class SaleCreate(SaleFields):
    pass


class SaleUpdate(SaleFields):
    pass


class SaleItemRead(BaseModel):
    product_id: int | None
    product_name: str
    product_sku: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal


class SaleRead(BaseModel):
    id: int
    customer_name: str | None
    notes: str | None
    created_at: datetime
    items: list[SaleItemRead]
    total: Decimal


PurchaseOrderStatus = Literal["rascunho", "enviado", "recebido", "cancelado"]


class PurchaseOrderItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=999999)
    unit_cost: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class PurchaseOrderFields(BaseModel):
    supplier_id: int = Field(gt=0)
    status: PurchaseOrderStatus = "rascunho"
    expected_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    items: list[PurchaseOrderItemInput] = Field(min_length=1, max_length=100)

    @field_validator("notes")
    @classmethod
    def normalize_purchase_order_notes(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None

    @field_validator("items")
    @classmethod
    def ensure_unique_order_products(
        cls, value: list[PurchaseOrderItemInput]
    ) -> list[PurchaseOrderItemInput]:
        product_ids = [item.product_id for item in value]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Um produto não pode aparecer mais de uma vez no pedido")
        return value


class PurchaseOrderCreate(PurchaseOrderFields):
    pass


class PurchaseOrderUpdate(PurchaseOrderFields):
    pass


class PurchaseOrderItemRead(BaseModel):
    product_id: int | None
    product_name: str
    product_sku: str
    quantity: int
    unit_cost: Decimal
    subtotal: Decimal


class PurchaseOrderRead(BaseModel):
    id: int
    supplier_id: int | None
    supplier_name: str
    supplier_document: str
    status: PurchaseOrderStatus
    expected_date: date | None
    notes: str | None
    created_at: datetime
    items: list[PurchaseOrderItemRead]
    total: Decimal


class InventoryRead(BaseModel):
    product_id: int
    product_name: str
    product_sku: str
    category: str
    received_quantity: int
    sold_quantity: int
    available_quantity: int


class ReplenishmentPolicyInput(BaseModel):
    supplier_id: int = Field(gt=0)
    minimum_stock: int = Field(ge=10, le=999999)
    target_stock: int = Field(ge=1, le=999999)
    unit_cost: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    lead_time_days: int = Field(ge=1, le=365)
    enabled: bool = True

    @model_validator(mode="after")
    def target_must_exceed_minimum(self):
        if self.target_stock <= self.minimum_stock:
            raise ValueError("O estoque alvo deve ser maior que o estoque mínimo")
        return self


class ReplenishmentPolicyRead(ReplenishmentPolicyInput):
    product_id: int
    product_name: str
    product_sku: str
    supplier_name: str


ReplenishmentPriority = Literal["configurar", "pausada", "normal", "media", "alta", "critica"]


class ReplenishmentItemRead(BaseModel):
    product_id: int
    product_name: str
    product_sku: str
    category: str
    configured: bool
    enabled: bool
    supplier_id: int | None
    supplier_name: str | None
    minimum_stock: int | None
    target_stock: int | None
    unit_cost: Decimal | None
    lead_time_days: int | None
    available_quantity: int
    on_order_quantity: int
    recent_sold_quantity: int
    average_daily_sales: Decimal
    lead_time_demand: int
    projected_quantity: int
    recommended_quantity: int
    estimated_cost: Decimal
    priority: ReplenishmentPriority
    reason: str


class ReplenishmentPlanRead(BaseModel):
    window_days: int
    generated_at: datetime
    items: list[ReplenishmentItemRead]
    configured_count: int
    recommendation_count: int
    estimated_total: Decimal


class ReplenishmentGenerateInput(BaseModel):
    product_ids: list[int] = Field(min_length=1, max_length=500)
    window_days: int = Field(default=30, ge=7, le=180)

    @field_validator("product_ids")
    @classmethod
    def ensure_unique_replenishment_products(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("Cada produto deve aparecer apenas uma vez")
        if any(product_id <= 0 for product_id in value):
            raise ValueError("Produto inválido")
        return value


class ReplenishmentGenerateRead(BaseModel):
    orders: list[PurchaseOrderRead]
    order_count: int
    item_count: int
    estimated_total: Decimal


class AgentChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def normalize_agent_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Digite uma mensagem")
        return value


class AgentChatRead(BaseModel):
    message: str
    suggestions: list[str] = Field(default_factory=list)
    restricted: bool = False


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: SecretStr = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    username: str


def get_session():
    with SessionLocal() as session:
        yield session


def find_category(session: Session, name: str) -> Category | None:
    return session.scalar(
        select(Category).where(func.lower(Category.name) == name.strip().lower())
    )


def category_to_read(session: Session, category: Category) -> CategoryRead:
    product_count = session.scalar(
        select(func.count(Product.id)).where(
            func.lower(Product.category) == category.name.lower()
        )
    )
    return CategoryRead(
        id=category.id,
        name=category.name,
        description=category.description,
        product_count=product_count or 0,
    )


def find_supplier_by_document(session: Session, document: str) -> Supplier | None:
    return session.scalar(
        select(Supplier).where(
            func.lower(Supplier.document) == document.strip().lower()
        )
    )


def build_sale_items(session: Session, inputs: list[SaleItemInput]) -> list[SaleItem]:
    product_ids = [item.product_id for item in inputs]
    products = {
        product.id: product
        for product in session.scalars(
            select(Product).where(Product.id.in_(product_ids))
        ).all()
    }
    missing_ids = [product_id for product_id in product_ids if product_id not in products]
    if missing_ids:
        raise HTTPException(
            status_code=422,
            detail=f"Produto não encontrado: #{missing_ids[0]}.",
        )
    return [
        SaleItem(
            product_id=item.product_id,
            product_name=products[item.product_id].name,
            product_sku=products[item.product_id].sku,
            quantity=item.quantity,
            unit_price=products[item.product_id].price,
        )
        for item in inputs
    ]


def sale_to_read(sale: Sale) -> SaleRead:
    items = [
        SaleItemRead(
            product_id=item.product_id,
            product_name=item.product_name,
            product_sku=item.product_sku,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.unit_price * item.quantity,
        )
        for item in sale.items
    ]
    return SaleRead(
        id=sale.id,
        customer_name=sale.customer_name,
        notes=sale.notes,
        created_at=sale.created_at,
        items=items,
        total=sum((item.subtotal for item in items), Decimal("0.00")),
    )


def build_purchase_order_items(
    session: Session, inputs: list[PurchaseOrderItemInput]
) -> list[PurchaseOrderItem]:
    product_ids = [item.product_id for item in inputs]
    products = {
        product.id: product
        for product in session.scalars(
            select(Product).where(Product.id.in_(product_ids))
        ).all()
    }
    missing_ids = [product_id for product_id in product_ids if product_id not in products]
    if missing_ids:
        raise HTTPException(
            status_code=422,
            detail=f"Produto não encontrado: #{missing_ids[0]}.",
        )
    return [
        PurchaseOrderItem(
            product_id=item.product_id,
            product_name=products[item.product_id].name,
            product_sku=products[item.product_id].sku,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
        )
        for item in inputs
    ]


def purchase_order_to_read(order: PurchaseOrder) -> PurchaseOrderRead:
    items = [
        PurchaseOrderItemRead(
            product_id=item.product_id,
            product_name=item.product_name,
            product_sku=item.product_sku,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            subtotal=item.unit_cost * item.quantity,
        )
        for item in order.items
    ]
    return PurchaseOrderRead(
        id=order.id,
        supplier_id=order.supplier_id,
        supplier_name=order.supplier_name,
        supplier_document=order.supplier_document,
        status=order.status,
        expected_date=order.expected_date,
        notes=order.notes,
        created_at=order.created_at,
        items=items,
        total=sum((item.subtotal for item in items), Decimal("0.00")),
    )


def replenishment_policy_to_read(
    policy: ReplenishmentPolicy, product: Product, supplier: Supplier
) -> ReplenishmentPolicyRead:
    return ReplenishmentPolicyRead(
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        minimum_stock=policy.minimum_stock,
        target_stock=policy.target_stock,
        unit_cost=policy.unit_cost,
        lead_time_days=policy.lead_time_days,
        enabled=policy.enabled,
    )


def build_replenishment_plan(
    session: Session, window_days: int
) -> ReplenishmentPlanRead:
    received = (
        select(
            PurchaseOrderItem.product_id.label("product_id"),
            func.sum(PurchaseOrderItem.quantity).label("quantity"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.order_id)
        .where(
            PurchaseOrder.status == "recebido",
            PurchaseOrderItem.product_id.is_not(None),
        )
        .group_by(PurchaseOrderItem.product_id)
        .subquery()
    )
    sold = (
        select(
            SaleItem.product_id.label("product_id"),
            func.sum(SaleItem.quantity).label("quantity"),
        )
        .where(SaleItem.product_id.is_not(None))
        .group_by(SaleItem.product_id)
        .subquery()
    )
    on_order = (
        select(
            PurchaseOrderItem.product_id.label("product_id"),
            func.sum(PurchaseOrderItem.quantity).label("quantity"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.order_id)
        .where(
            PurchaseOrder.status.in_(["rascunho", "enviado"]),
            PurchaseOrderItem.product_id.is_not(None),
        )
        .group_by(PurchaseOrderItem.product_id)
        .subquery()
    )
    window_start = datetime.now(timezone.utc) - timedelta(days=window_days)
    recent_sold = (
        select(
            SaleItem.product_id.label("product_id"),
            func.sum(SaleItem.quantity).label("quantity"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            SaleItem.product_id.is_not(None),
            Sale.created_at >= window_start,
        )
        .group_by(SaleItem.product_id)
        .subquery()
    )

    statement = (
        select(
            Product,
            ReplenishmentPolicy,
            Supplier,
            func.coalesce(received.c.quantity, 0),
            func.coalesce(sold.c.quantity, 0),
            func.coalesce(on_order.c.quantity, 0),
            func.coalesce(recent_sold.c.quantity, 0),
        )
        .outerjoin(ReplenishmentPolicy, ReplenishmentPolicy.product_id == Product.id)
        .outerjoin(Supplier, Supplier.id == ReplenishmentPolicy.supplier_id)
        .outerjoin(received, received.c.product_id == Product.id)
        .outerjoin(sold, sold.c.product_id == Product.id)
        .outerjoin(on_order, on_order.c.product_id == Product.id)
        .outerjoin(recent_sold, recent_sold.c.product_id == Product.id)
        .order_by(Product.name.asc())
    )

    items: list[ReplenishmentItemRead] = []
    for product, policy, supplier, received_count, sold_count, pending_count, recent_count in session.execute(statement).all():
        available = int(received_count) - int(sold_count)
        pending = int(pending_count)
        recent = int(recent_count)
        if policy is None:
            item = ReplenishmentItemRead(
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                category=product.category,
                configured=False,
                enabled=False,
                supplier_id=None,
                supplier_name=None,
                minimum_stock=None,
                target_stock=None,
                unit_cost=None,
                lead_time_days=None,
                available_quantity=available,
                on_order_quantity=pending,
                recent_sold_quantity=recent,
                average_daily_sales=Decimal(recent) / Decimal(window_days),
                lead_time_demand=0,
                projected_quantity=available + pending,
                recommended_quantity=0,
                estimated_cost=Decimal("0.00"),
                priority="configurar",
                reason="Defina fornecedor, níveis de estoque, custo e prazo.",
            )
        elif supplier is None:
            item = ReplenishmentItemRead(
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                category=product.category,
                configured=False,
                enabled=policy.enabled,
                supplier_id=None,
                supplier_name=None,
                minimum_stock=policy.minimum_stock,
                target_stock=policy.target_stock,
                unit_cost=policy.unit_cost,
                lead_time_days=policy.lead_time_days,
                available_quantity=available,
                on_order_quantity=pending,
                recent_sold_quantity=recent,
                average_daily_sales=Decimal(recent) / Decimal(window_days),
                lead_time_demand=0,
                projected_quantity=available + pending,
                recommended_quantity=0,
                estimated_cost=Decimal("0.00"),
                priority="configurar",
                reason="O fornecedor configurado não está mais disponível.",
            )
        elif not policy.enabled:
            item = ReplenishmentItemRead(
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                category=product.category,
                configured=True,
                enabled=False,
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                minimum_stock=policy.minimum_stock,
                target_stock=policy.target_stock,
                unit_cost=policy.unit_cost,
                lead_time_days=policy.lead_time_days,
                available_quantity=available,
                on_order_quantity=pending,
                recent_sold_quantity=recent,
                average_daily_sales=Decimal(recent) / Decimal(window_days),
                lead_time_demand=0,
                projected_quantity=available + pending,
                recommended_quantity=0,
                estimated_cost=Decimal("0.00"),
                priority="pausada",
                reason="Reposição automática pausada para este produto.",
            )
        else:
            calculation = calculate_replenishment(
                available_quantity=available,
                on_order_quantity=pending,
                recent_sold_quantity=recent,
                window_days=window_days,
                lead_time_days=policy.lead_time_days,
                minimum_stock=policy.minimum_stock,
                target_stock=policy.target_stock,
            )
            estimated_cost = policy.unit_cost * calculation.recommended_quantity
            item = ReplenishmentItemRead(
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                category=product.category,
                configured=True,
                enabled=True,
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                minimum_stock=policy.minimum_stock,
                target_stock=policy.target_stock,
                unit_cost=policy.unit_cost,
                lead_time_days=policy.lead_time_days,
                available_quantity=available,
                on_order_quantity=pending,
                recent_sold_quantity=recent,
                average_daily_sales=calculation.average_daily_sales,
                lead_time_demand=calculation.lead_time_demand,
                projected_quantity=calculation.projected_quantity,
                recommended_quantity=calculation.recommended_quantity,
                estimated_cost=estimated_cost,
                priority=calculation.priority,
                reason=calculation.reason,
            )
        items.append(item)

    recommended = [item for item in items if item.recommended_quantity > 0]
    return ReplenishmentPlanRead(
        window_days=window_days,
        generated_at=datetime.now(timezone.utc),
        items=items,
        configured_count=sum(item.configured for item in items),
        recommendation_count=len(recommended),
        estimated_total=sum(
            (item.estimated_cost for item in recommended), Decimal("0.00")
        ),
    )


def create_replenishment_orders(
    session: Session,
    window_days: int = 30,
    product_ids: set[int] | None = None,
    automatic: bool = False,
) -> ReplenishmentGenerateRead | None:
    """Cria pedidos para itens abaixo do limite, sem duplicar pedidos em aberto."""
    # Serializa execuções concorrentes, inclusive quando duas vendas chegam juntas.
    session.execute(select(func.pg_advisory_xact_lock(8182026)))
    plan = build_replenishment_plan(session, window_days)
    eligible = [
        item
        for item in plan.items
        if (product_ids is None or item.product_id in product_ids)
        and item.recommended_quantity > 0
        and item.supplier_id is not None
        and item.unit_cost is not None
    ]
    if not eligible:
        return None

    products = {
        product.id: product
        for product in session.scalars(
            select(Product).where(Product.id.in_([item.product_id for item in eligible]))
        ).all()
    }
    suppliers = {
        supplier.id: supplier
        for supplier in session.scalars(
            select(Supplier).where(
                Supplier.id.in_([item.supplier_id for item in eligible])
            )
        ).all()
    }
    grouped: dict[int, list[ReplenishmentItemRead]] = {}
    for item in eligible:
        grouped.setdefault(item.supplier_id, []).append(item)

    orders: list[PurchaseOrder] = []
    for supplier_id, group_items in grouped.items():
        supplier = suppliers.get(supplier_id)
        if supplier is None:
            continue
        for offset in range(0, len(group_items), 100):
            order_items = group_items[offset : offset + 100]
            maximum_lead_time = max(item.lead_time_days or 1 for item in order_items)
            order = PurchaseOrder(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                supplier_document=supplier.document,
                status="rascunho",
                expected_date=date.today() + timedelta(days=maximum_lead_time),
                notes=(
                    "Pedido criado automaticamente pelo agente ao atingir o estoque "
                    f"mínimo ({window_days} dias de histórico)."
                    if automatic
                    else (
                        "Rascunho montado pelo agente de reposição com base em "
                        f"{window_days} dias de vendas. Revise antes de enviar."
                    )
                ),
            )
            order.items = [
                PurchaseOrderItem(
                    product_id=item.product_id,
                    product_name=products[item.product_id].name,
                    product_sku=products[item.product_id].sku,
                    quantity=item.recommended_quantity,
                    unit_cost=item.unit_cost,
                )
                for item in order_items
            ]
            session.add(order)
            orders.append(order)

    if not orders:
        return None
    session.commit()
    for order in orders:
        session.refresh(order)
    order_reads = [purchase_order_to_read(order) for order in orders]
    return ReplenishmentGenerateRead(
        orders=order_reads,
        order_count=len(order_reads),
        item_count=sum(len(order.items) for order in order_reads),
        estimated_total=sum((order.total for order in order_reads), Decimal("0.00")),
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        admin = session.scalar(select(User).where(User.username == ADMIN_USERNAME))
        if admin is None:
            session.add(
                User(
                    username=ADMIN_USERNAME,
                    hashed_password=password_hash.hash(ADMIN_PASSWORD),
                )
            )
        existing_names = {
            name.lower() for name in session.scalars(select(Category.name)).all()
        }
        product_categories = session.scalars(select(Product.category).distinct()).all()
        for name in product_categories:
            normalized_name = name.strip()
            if normalized_name and normalized_name.lower() not in existing_names:
                session.add(Category(name=normalized_name))
                existing_names.add(normalized_name.lower())
        session.commit()
    yield


app = FastAPI(
    title="Estoque · API de catálogo, operações e reposição",
    version="1.6.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


def get_current_user(
    token: str | None = Cookie(default=None, alias=AUTH_COOKIE),
    session: Session = Depends(get_session),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sua sessão expirou. Entre novamente.",
    )
    if not token:
        raise unauthorized
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        username = payload.get("sub")
        if not isinstance(username, str):
            raise unauthorized
    except InvalidTokenError as exc:
        raise unauthorized from exc
    user = session.scalar(select(User).where(User.username == username))
    if user is None:
        raise unauthorized
    return user


@app.get("/health", tags=["saúde"])
def health():
    return {"status": "ok"}


def openai_agent_reply(session: Session, user_message: str) -> AgentChatRead:
    if not OPENAI_API_KEY or not OPENAI_MODEL:
        raise HTTPException(
            status_code=503,
            detail="O provedor OpenAI está selecionado, mas OPENAI_API_KEY e OPENAI_MODEL precisam ser configurados.",
        )
    plan = build_replenishment_plan(session, 30)
    low_stock = [item for item in plan.items if item.recommended_quantity > 0]
    safe_low_stock = [
        {
            "produto": item.product_name,
            "sku": item.product_sku,
            "categoria": item.category,
            "saldo": item.available_quantity,
            "minimo": item.minimum_stock,
            "alvo": item.target_stock,
            "recomendacao": item.recommended_quantity,
            "prioridade": item.priority,
        }
        for item in low_stock[:20]
    ]
    context = {
        "produtos_monitorados": len(plan.items),
        "produtos_com_reposicao": len(low_stock),
        "produtos_no_limite": safe_low_stock,
        "janela_vendas_dias": 30,
        "estoque_minimo_configurado": "pelo menos 10 unidades",
    }
    instructions = (
        "Você é o agente operacional do sistema Armazém. Responda em português, "
        "somente sobre estoque, produtos, categorias, vendas, fornecedores, pedidos "
        "e reposição. Use exclusivamente o contexto operacional fornecido. Nunca "
        "revele, solicite ou invente senhas, tokens, chaves, documentos, e-mails, "
        "telefones, endereços ou outros dados confidenciais. Recuse assuntos fora "
        "do sistema. Não execute ações de compra: apenas explique e recomende; o "
        "envio de pedidos exige aprovação humana. Seja objetivo e indique quando "
        "uma informação não estiver disponível.\n\n"
        f"Contexto seguro do estoque: {json.dumps(context, ensure_ascii=False)}"
    )
    body = json.dumps(
        {
            "model": OPENAI_MODEL,
            "instructions": instructions,
            "input": user_message,
            "max_output_tokens": 400,
        }
    ).encode("utf-8")
    request = Request(
        f"{OPENAI_BASE_URL}/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Não foi possível consultar o provedor configurado do agente.",
        ) from exc
    answer = result.get("output_text")
    if not answer:
        for output in result.get("output", []):
            for content in output.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    answer = content["text"]
                    break
            if answer:
                break
    return AgentChatRead(
        message=answer or "O provedor não retornou uma resposta textual.",
        suggestions=["Quais produtos estão no limite?", "Como melhorar a reposição automática?"],
    )


@app.post("/agent/chat", response_model=AgentChatRead, tags=["agente de reposição"])
def agent_chat(
    payload: AgentChatInput,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """Conversa restrita às operações do estoque, com provedor local ou OpenAI opcional."""
    text = payload.message.casefold()
    confidential_terms = (
        "senha", "password", "token", "jwt", "credencial", "segredo", "cpf",
        "cnpj", "documento", "telefone", "e-mail", "email", "endereço", "endereco",
    )
    if any(term in text for term in confidential_terms):
        return AgentChatRead(
            message=(
                "Não posso fornecer credenciais, documentos, contatos privados ou "
                "segredos do sistema. Posso ajudar apenas com estoque, produtos, "
                "vendas, fornecedores, pedidos e reposição."
            ),
            restricted=True,
        )

    domain_terms = (
        "estoque", "produto", "sku", "categoria", "venda", "vendido", "saldo",
        "fornecedor", "pedido", "reposição", "reposicao", "mínimo", "minimo",
        "agente", "comprar", "compra", "inventário", "inventario", "ação", "acao",
        "limite", "abaixo", "baixo", "crítico", "critico",
    )
    greeting_terms = ("olá", "ola", "oi", "bom dia", "boa tarde", "boa noite")
    if not any(term in text for term in domain_terms) and not any(term in text for term in greeting_terms):
        return AgentChatRead(
            message=(
                "Sou o agente de operações do Armazém. Posso conversar sobre saldo "
                "de estoque, vendas, produtos, fornecedores, pedidos e melhorias "
                "na reposição automática."
            ),
            restricted=True,
        )

    if any(term in text for term in greeting_terms) and not any(term in text for term in domain_terms):
        return AgentChatRead(
            message=(
                "Agente ativo. Pergunte, por exemplo, quais produtos estão no limite, "
                "como melhorar a reposição ou quais pedidos estão em rascunho."
            ),
            suggestions=["Quais produtos estão no limite?", "Como melhorar a reposição automática?"],
        )

    if AGENT_PROVIDER == "openai":
        return openai_agent_reply(session, payload.message)
    if AGENT_PROVIDER not in {"local", "openai"}:
        raise HTTPException(
            status_code=503,
            detail="AGENT_PROVIDER inválido. Use local ou openai.",
        )

    plan = build_replenishment_plan(session, 30)
    low_stock = [item for item in plan.items if item.recommended_quantity > 0]
    suggestions: list[str] = []
    if any(term in text for term in ("ação", "acao", "melhorar", "melhoria", "agente")):
        message = (
            "A reposição usa 30 dias de vendas, considera pedidos em aberto e agrupa "
            "os pedidos por fornecedor. Para melhorar a ação do agente, mantenha o "
            "mínimo em pelo menos 10 unidades, revise o estoque-alvo e atualize prazo "
            "e custo das políticas quando mudar de fornecedor."
        )
        suggestions = ["Quais produtos precisam de reposição?", "Mostrar resumo do estoque"]
    elif any(term in text for term in ("reposição", "reposicao", "pedido", "comprar", "compra", "limite", "abaixo", "baixo", "crítico", "critico")):
        if low_stock:
            names = ", ".join(item.product_name for item in low_stock[:5])
            suffix = "" if len(low_stock) <= 5 else f" e mais {len(low_stock) - 5}"
            message = (
                f"Encontrei {len(low_stock)} produto(s) com reposição recomendada: "
                f"{names}{suffix}. O agente cria rascunhos agrupados por fornecedor e "
                "não duplica itens que já estejam em pedidos abertos."
            )
        else:
            message = "Não há produtos abaixo do limite neste momento; nenhum novo pedido precisa ser criado."
        suggestions = ["Como o agente decide a quantidade?", "Como melhorar a reposição automática?"]
    elif any(term in text for term in ("produto", "categoria", "sku")):
        product_count = session.scalar(select(func.count()).select_from(Product)) or 0
        category_count = session.scalar(select(func.count()).select_from(Category)) or 0
        message = f"O catálogo tem {product_count} produto(s) distribuídos em {category_count} categoria(s)."
        suggestions = ["Quais produtos estão no limite?", "Mostrar resumo do estoque"]
    else:
        message = (
            f"O agente acompanha {len(plan.items)} produto(s). No momento, "
            f"{len(low_stock)} têm recomendação de reposição. Posso detalhar o estoque "
            "ou explicar como melhorar as regras."
        )
        suggestions = ["Quais produtos estão no limite?", "Como melhorar a reposição automática?"]
    return AgentChatRead(message=message, suggestions=suggestions)


@app.post("/auth/login", response_model=UserRead, tags=["autenticação"])
def login(
    payload: LoginInput,
    response: Response,
    session: Session = Depends(get_session),
):
    user = session.scalar(select(User).where(User.username == payload.username.strip()))
    submitted_password = payload.password.get_secret_value()
    if user is None:
        password_hash.verify(submitted_password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
    if not password_hash.verify(submitted_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    token = jwt.encode(
        {"sub": user.username, "exp": expires_at}, JWT_SECRET, algorithm="HS256"
    )
    response.set_cookie(
        key=AUTH_COOKIE,
        value=token,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )
    return UserRead(username=user.username)


@app.get("/auth/me", response_model=UserRead, tags=["autenticação"])
def read_current_user(user: User = Depends(get_current_user)):
    return UserRead(username=user.username)


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["autenticação"])
def logout(response: Response):
    response.delete_cookie(key=AUTH_COOKIE, httponly=True, samesite="lax", path="/")


@app.get("/products", response_model=list[ProductRead], tags=["produtos"])
def list_products(
    search: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=80),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = select(Product).order_by(Product.name.asc())
    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            Product.name.ilike(term) | Product.sku.ilike(term) | Product.category.ilike(term)
        )
    if category and category.strip():
        statement = statement.where(Product.category == category.strip())
    return session.scalars(statement).all()


@app.get("/categories", response_model=list[CategoryRead], tags=["categorias"])
def list_categories(
    search: str | None = Query(default=None, max_length=80),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = select(Category).order_by(Category.name.asc())
    if search and search.strip():
        statement = statement.where(Category.name.ilike(f"%{search.strip()}%"))
    categories = session.scalars(statement).all()
    return [category_to_read(session, category) for category in categories]


@app.get("/categories/{category_id}", response_model=CategoryRead, tags=["categorias"])
def read_category(
    category_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    return category_to_read(session, category)


@app.post(
    "/categories",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    tags=["categorias"],
)
def create_category(
    payload: CategoryCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    if find_category(session, payload.name):
        raise HTTPException(status_code=409, detail="Já existe uma categoria com este nome.")
    category = Category(**payload.model_dump())
    session.add(category)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Já existe uma categoria com este nome."
        ) from exc
    session.refresh(category)
    return category_to_read(session, category)


@app.put("/categories/{category_id}", response_model=CategoryRead, tags=["categorias"])
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    duplicate = find_category(session, payload.name)
    if duplicate and duplicate.id != category.id:
        raise HTTPException(status_code=409, detail="Já existe uma categoria com este nome.")

    previous_name = category.name
    category.name = payload.name
    category.description = payload.description
    if previous_name != category.name:
        session.execute(
            update(Product)
            .where(func.lower(Product.category) == previous_name.lower())
            .values(category=category.name)
        )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Já existe uma categoria com este nome."
        ) from exc
    session.refresh(category)
    return category_to_read(session, category)


@app.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["categorias"],
)
def delete_category(
    category_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    product_count = session.scalar(
        select(func.count(Product.id)).where(
            func.lower(Product.category) == category.name.lower()
        )
    )
    if product_count:
        raise HTTPException(
            status_code=409,
            detail="Esta categoria possui produtos vinculados e não pode ser removida.",
        )
    session.delete(category)
    session.commit()


@app.get("/suppliers", response_model=list[SupplierRead], tags=["fornecedores"])
def list_suppliers(
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = select(Supplier).order_by(Supplier.name.asc())
    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            Supplier.name.ilike(term)
            | Supplier.document.ilike(term)
            | Supplier.contact_name.ilike(term)
            | Supplier.email.ilike(term)
        )
    return session.scalars(statement).all()


@app.get(
    "/suppliers/{supplier_id}", response_model=SupplierRead, tags=["fornecedores"]
)
def read_supplier(
    supplier_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    return supplier


@app.post(
    "/suppliers",
    response_model=SupplierRead,
    status_code=status.HTTP_201_CREATED,
    tags=["fornecedores"],
)
def create_supplier(
    payload: SupplierCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    if find_supplier_by_document(session, payload.document):
        raise HTTPException(
            status_code=409, detail="Já existe um fornecedor com este documento."
        )
    supplier = Supplier(**payload.model_dump())
    session.add(supplier)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Já existe um fornecedor com este documento."
        ) from exc
    session.refresh(supplier)
    return supplier


@app.put(
    "/suppliers/{supplier_id}", response_model=SupplierRead, tags=["fornecedores"]
)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    duplicate = find_supplier_by_document(session, payload.document)
    if duplicate and duplicate.id != supplier.id:
        raise HTTPException(
            status_code=409, detail="Já existe um fornecedor com este documento."
        )
    for field, value in payload.model_dump().items():
        setattr(supplier, field, value)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Já existe um fornecedor com este documento."
        ) from exc
    session.refresh(supplier)
    return supplier


@app.delete(
    "/suppliers/{supplier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["fornecedores"],
)
def delete_supplier(
    supplier_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    session.delete(supplier)
    session.commit()


@app.get("/sales", response_model=list[SaleRead], tags=["vendas"])
def list_sales(
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = (
        select(Sale)
        .options(selectinload(Sale.items))
        .order_by(Sale.created_at.desc(), Sale.id.desc())
    )
    if search and search.strip():
        raw_term = search.strip()
        term = f"%{raw_term}%"
        conditions = [
            Sale.customer_name.ilike(term),
            Sale.items.any(
                or_(
                    SaleItem.product_name.ilike(term),
                    SaleItem.product_sku.ilike(term),
                )
            ),
        ]
        if raw_term.isdigit():
            conditions.append(Sale.id == int(raw_term))
        statement = statement.where(or_(*conditions))
    return [sale_to_read(sale) for sale in session.scalars(statement).all()]


@app.get("/sales/{sale_id}", response_model=SaleRead, tags=["vendas"])
def read_sale(
    sale_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    sale = session.scalar(
        select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Venda não encontrada.")
    return sale_to_read(sale)


@app.post(
    "/sales",
    response_model=SaleRead,
    status_code=status.HTTP_201_CREATED,
    tags=["vendas"],
)
def create_sale(
    payload: SaleCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    sale = Sale(customer_name=payload.customer_name, notes=payload.notes)
    sale.items = build_sale_items(session, payload.items)
    session.add(sale)
    session.commit()
    session.refresh(sale)
    create_replenishment_orders(
        session,
        window_days=30,
        product_ids={item.product_id for item in sale.items if item.product_id is not None},
        automatic=True,
    )
    return sale_to_read(sale)


@app.put("/sales/{sale_id}", response_model=SaleRead, tags=["vendas"])
def update_sale(
    sale_id: int,
    payload: SaleUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    sale = session.scalar(
        select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Venda não encontrada.")
    sale.customer_name = payload.customer_name
    sale.notes = payload.notes
    sale.items = build_sale_items(session, payload.items)
    session.commit()
    session.refresh(sale)
    create_replenishment_orders(
        session,
        window_days=30,
        product_ids={item.product_id for item in sale.items if item.product_id is not None},
        automatic=True,
    )
    return sale_to_read(sale)


@app.delete(
    "/sales/{sale_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["vendas"]
)
def delete_sale(
    sale_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    sale = session.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(status_code=404, detail="Venda não encontrada.")
    session.delete(sale)
    session.commit()


@app.get(
    "/purchase-orders",
    response_model=list[PurchaseOrderRead],
    tags=["pedidos de compra"],
)
def list_purchase_orders(
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc())
    )
    if search and search.strip():
        raw_term = search.strip()
        term = f"%{raw_term}%"
        conditions = [
            PurchaseOrder.supplier_name.ilike(term),
            PurchaseOrder.supplier_document.ilike(term),
            PurchaseOrder.status.ilike(term),
            PurchaseOrder.items.any(
                or_(
                    PurchaseOrderItem.product_name.ilike(term),
                    PurchaseOrderItem.product_sku.ilike(term),
                )
            ),
        ]
        if raw_term.isdigit():
            conditions.append(PurchaseOrder.id == int(raw_term))
        statement = statement.where(or_(*conditions))
    return [
        purchase_order_to_read(order)
        for order in session.scalars(statement).all()
    ]


@app.get(
    "/purchase-orders/{order_id}",
    response_model=PurchaseOrderRead,
    tags=["pedidos de compra"],
)
def read_purchase_order(
    order_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    order = session.scalar(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    return purchase_order_to_read(order)


@app.post(
    "/purchase-orders",
    response_model=PurchaseOrderRead,
    status_code=status.HTTP_201_CREATED,
    tags=["pedidos de compra"],
)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, payload.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=422, detail="Selecione um fornecedor cadastrado.")
    order = PurchaseOrder(
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        supplier_document=supplier.document,
        status=payload.status,
        expected_date=payload.expected_date,
        notes=payload.notes,
    )
    order.items = build_purchase_order_items(session, payload.items)
    session.add(order)
    session.commit()
    session.refresh(order)
    return purchase_order_to_read(order)


@app.put(
    "/purchase-orders/{order_id}",
    response_model=PurchaseOrderRead,
    tags=["pedidos de compra"],
)
def update_purchase_order(
    order_id: int,
    payload: PurchaseOrderUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    order = session.scalar(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    supplier = session.get(Supplier, payload.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=422, detail="Selecione um fornecedor cadastrado.")
    order.supplier_id = supplier.id
    order.supplier_name = supplier.name
    order.supplier_document = supplier.document
    order.status = payload.status
    order.expected_date = payload.expected_date
    order.notes = payload.notes
    order.items = build_purchase_order_items(session, payload.items)
    session.commit()
    session.refresh(order)
    return purchase_order_to_read(order)


@app.delete(
    "/purchase-orders/{order_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["pedidos de compra"],
)
def delete_purchase_order(
    order_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    order = session.get(PurchaseOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    session.delete(order)
    session.commit()


@app.get("/inventory", response_model=list[InventoryRead], tags=["estoque"])
def list_inventory(
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    received = (
        select(
            PurchaseOrderItem.product_id.label("product_id"),
            func.sum(PurchaseOrderItem.quantity).label("received_quantity"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.order_id)
        .where(
            PurchaseOrder.status == "recebido",
            PurchaseOrderItem.product_id.is_not(None),
        )
        .group_by(PurchaseOrderItem.product_id)
        .subquery()
    )
    sold = (
        select(
            SaleItem.product_id.label("product_id"),
            func.sum(SaleItem.quantity).label("sold_quantity"),
        )
        .where(SaleItem.product_id.is_not(None))
        .group_by(SaleItem.product_id)
        .subquery()
    )
    received_quantity = func.coalesce(received.c.received_quantity, 0)
    sold_quantity = func.coalesce(sold.c.sold_quantity, 0)
    statement = (
        select(Product, received_quantity, sold_quantity)
        .outerjoin(received, received.c.product_id == Product.id)
        .outerjoin(sold, sold.c.product_id == Product.id)
        .order_by(Product.name.asc())
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            Product.name.ilike(term)
            | Product.sku.ilike(term)
            | Product.category.ilike(term)
        )
    return [
        InventoryRead(
            product_id=product.id,
            product_name=product.name,
            product_sku=product.sku,
            category=product.category,
            received_quantity=int(received_count),
            sold_quantity=int(sold_count),
            available_quantity=int(received_count) - int(sold_count),
        )
        for product, received_count, sold_count in session.execute(statement).all()
    ]


@app.get(
    "/replenishment/plan",
    response_model=ReplenishmentPlanRead,
    tags=["agente de reposição"],
)
def read_replenishment_plan(
    window_days: int = Query(default=30, ge=7, le=180),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    return build_replenishment_plan(session, window_days)


@app.put(
    "/replenishment/policies/{product_id}",
    response_model=ReplenishmentPolicyRead,
    tags=["agente de reposição"],
)
def save_replenishment_policy(
    product_id: int,
    payload: ReplenishmentPolicyInput,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    supplier = session.get(Supplier, payload.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=422, detail="Selecione um fornecedor cadastrado.")
    policy = session.get(ReplenishmentPolicy, product_id)
    if policy is None:
        policy = ReplenishmentPolicy(product_id=product_id)
        session.add(policy)
    for field, value in payload.model_dump().items():
        setattr(policy, field, value)
    session.commit()
    session.refresh(policy)
    return replenishment_policy_to_read(policy, product, supplier)


@app.delete(
    "/replenishment/policies/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["agente de reposição"],
)
def delete_replenishment_policy(
    product_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    policy = session.get(ReplenishmentPolicy, product_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    session.delete(policy)
    session.commit()


@app.post(
    "/replenishment/generate-orders",
    response_model=ReplenishmentGenerateRead,
    status_code=status.HTTP_201_CREATED,
    tags=["agente de reposição"],
)
def generate_replenishment_orders(
    payload: ReplenishmentGenerateInput,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    result = create_replenishment_orders(
        session,
        window_days=payload.window_days,
        product_ids=set(payload.product_ids),
        automatic=False,
    )
    if result is None:
        raise HTTPException(
            status_code=409,
            detail="Nenhum dos produtos selecionados precisa de reposição neste momento.",
        )
    return result


@app.post(
    "/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED, tags=["produtos"]
)
def create_product(
    payload: ProductCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    category = find_category(session, payload.category)
    if category is None:
        raise HTTPException(status_code=422, detail="Selecione uma categoria cadastrada.")
    product_data = payload.model_dump()
    product_data["category"] = category.name
    product = Product(**product_data)
    session.add(product)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Já existe um produto com este SKU.") from exc
    session.refresh(product)
    return product


@app.put("/products/{product_id}", response_model=ProductRead, tags=["produtos"])
def update_product(
    product_id: int,
    payload: ProductUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    category = find_category(session, payload.category)
    if category is None:
        raise HTTPException(status_code=422, detail="Selecione uma categoria cadastrada.")
    product_data = payload.model_dump()
    product_data["category"] = category.name
    for field, value in product_data.items():
        setattr(product, field, value)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Já existe um produto com este SKU.") from exc
    session.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["produtos"])
def delete_product(
    product_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    session.delete(product)
    session.commit()
