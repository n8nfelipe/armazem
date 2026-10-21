export type Product = {
  id: number;
  name: string;
  sku: string;
  description: string | null;
  category: string;
  price: string;
};

export type ProductInput = Omit<Product, "id">;
export type CurrentUser = { username: string };
export type Category = {
  id: number;
  name: string;
  description: string | null;
  product_count: number;
};
export type CategoryInput = Pick<Category, "name" | "description">;
export type Supplier = {
  id: number;
  name: string;
  document: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};
export type SupplierInput = Omit<Supplier, "id">;
export type SaleItemInput = { product_id: number; quantity: number };
export type SaleInput = {
  customer_name: string | null;
  notes: string | null;
  items: SaleItemInput[];
};
export type SaleItem = Omit<SaleItemInput, "product_id"> & {
  product_id: number | null;
  product_name: string;
  product_sku: string;
  unit_price: string;
  subtotal: string;
};
export type Sale = {
  id: number;
  customer_name: string | null;
  notes: string | null;
  created_at: string;
  items: SaleItem[];
  total: string;
};
export type PurchaseOrderStatus = "rascunho" | "enviado" | "recebido" | "cancelado";
export type PurchaseOrderItemInput = { product_id: number; quantity: number; unit_cost: string };
export type PurchaseOrderInput = {
  supplier_id: number;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  notes: string | null;
  items: PurchaseOrderItemInput[];
};
export type PurchaseOrderItem = Omit<PurchaseOrderItemInput, "product_id"> & {
  product_id: number | null;
  product_name: string;
  product_sku: string;
  subtotal: string;
};
export type PurchaseOrder = {
  id: number;
  supplier_id: number | null;
  supplier_name: string;
  supplier_document: string;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  items: PurchaseOrderItem[];
  total: string;
};
export type InventoryItem = {
  product_id: number;
  product_name: string;
  product_sku: string;
  category: string;
  received_quantity: number;
  sold_quantity: number;
  available_quantity: number;
};
export type ReplenishmentPriority = "configurar" | "pausada" | "normal" | "media" | "alta" | "critica";
export type ReplenishmentItem = {
  product_id: number;
  product_name: string;
  product_sku: string;
  category: string;
  configured: boolean;
  enabled: boolean;
  supplier_id: number | null;
  supplier_name: string | null;
  minimum_stock: number | null;
  target_stock: number | null;
  unit_cost: string | null;
  lead_time_days: number | null;
  available_quantity: number;
  on_order_quantity: number;
  recent_sold_quantity: number;
  average_daily_sales: string;
  lead_time_demand: number;
  projected_quantity: number;
  recommended_quantity: number;
  estimated_cost: string;
  priority: ReplenishmentPriority;
  reason: string;
};
export type ReplenishmentPlan = {
  window_days: number;
  generated_at: string;
  items: ReplenishmentItem[];
  configured_count: number;
  recommendation_count: number;
  estimated_total: string;
};
export type ReplenishmentPolicyInput = {
  supplier_id: number;
  minimum_stock: number;
  target_stock: number;
  unit_cost: string;
  lead_time_days: number;
  enabled: boolean;
};
export type ReplenishmentGeneration = {
  orders: PurchaseOrder[];
  order_count: number;
  item_count: number;
  estimated_total: string;
};

export type AgentChatReply = {
  message: string;
  suggestions: string[];
  restricted: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function readError(response: Response): Promise<Error> {
  try {
    const payload = await response.json();
    const message = Array.isArray(payload.detail)
      ? "Confira os campos e tente novamente."
      : payload.detail;
    return new Error(message || "Não foi possível concluir a operação.");
  } catch {
    return new Error("Não foi possível concluir a operação.");
  }
}

export async function getProducts(search = ""): Promise<Product[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/products${query}`, { cache: "no-store", credentials: "include" });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function saveProduct(input: ProductInput, id?: number): Promise<Product> {
  const response = await fetch(`${API_URL}/products${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function removeProduct(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/products/${id}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw await readError(response);
}

export async function getCategories(search = ""): Promise<Category[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/categories${query}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function saveCategory(input: CategoryInput, id?: number): Promise<Category> {
  const response = await fetch(`${API_URL}/categories${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function removeCategory(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/categories/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
}

export async function getSuppliers(search = ""): Promise<Supplier[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/suppliers${query}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function saveSupplier(input: SupplierInput, id?: number): Promise<Supplier> {
  const response = await fetch(`${API_URL}/suppliers${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function removeSupplier(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/suppliers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
}

export async function getSales(search = ""): Promise<Sale[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/sales${query}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function saveSale(input: SaleInput, id?: number): Promise<Sale> {
  const response = await fetch(`${API_URL}/sales${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function removeSale(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/sales/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
}

export async function getPurchaseOrders(search = ""): Promise<PurchaseOrder[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/purchase-orders${query}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function savePurchaseOrder(input: PurchaseOrderInput, id?: number): Promise<PurchaseOrder> {
  const response = await fetch(`${API_URL}/purchase-orders${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function removePurchaseOrder(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/purchase-orders/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
}

export async function getInventory(search = ""): Promise<InventoryItem[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const response = await fetch(`${API_URL}/inventory${query}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function getReplenishmentPlan(windowDays = 30): Promise<ReplenishmentPlan> {
  const response = await fetch(`${API_URL}/replenishment/plan?window_days=${windowDays}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function saveReplenishmentPolicy(
  productId: number,
  input: ReplenishmentPolicyInput,
): Promise<void> {
  const response = await fetch(`${API_URL}/replenishment/policies/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
}

export async function removeReplenishmentPolicy(productId: number): Promise<void> {
  const response = await fetch(`${API_URL}/replenishment/policies/${productId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
}

export async function generateReplenishmentOrders(
  productIds: number[],
  windowDays = 30,
): Promise<ReplenishmentGeneration> {
  const response = await fetch(`${API_URL}/replenishment/generate-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ product_ids: productIds, window_days: windowDays }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/auth/me`, { cache: "no-store", credentials: "include" });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function sendAgentMessage(message: string): Promise<AgentChatReply> {
  const response = await fetch(`${API_URL}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
  if (!response.ok) throw await readError(response);
}

export type AccountUpdateInput = {
  current_password: string;
  username: string;
  new_password?: string;
};

export async function updateAccount(input: AccountUpdateInput): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}
