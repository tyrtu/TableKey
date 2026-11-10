// ============================================================
// Database types — mirrors the Supabase schema exactly
// ============================================================

export type TableStatus = 'idle' | 'requested' | 'active' | 'awaiting_payment' | 'settling' | 'parked' | 'closed'
export type OrderStatus = 'new' | 'held' | 'preparing' | 'ready' | 'served' | 'awaiting_payment' | 'cancelled'
export type StaffRole = 'waiter' | 'kitchen' | 'admin' | 'owner' | 'manager'

// ── Payment enums (migration 006) ────────────────────────────
export type PaymentMode = 'pay_at_end' | 'pay_per_order' | 'hybrid'
export type ItemPaymentStatus = 'unpaid' | 'reserved' | 'paid' | 'voided' | 'comped'
export type PaymentState = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
export type PaymentMethodV2 = 'mpesa' | 'card' | 'cash'
export type VoidReason = 'wrong_item' | 'customer_changed_mind' | 'kitchen_error' | 'other'
export type CompReason = 'complaint' | 'service_issue' | 'manager_goodwill' | 'other'
export type OverrideReason = 'cash_received' | 'comped' | 'dispute' | 'other'
export type SplitType = 'full' | 'even' | 'items' | 'custom'

// ── Migration 010 enums ───────────────────────────────────────
export type OrderSource = 'customer' | 'waiter'
export type LineStatus = 'new' | 'preparing' | 'ready' | 'served' | 'voided'
export type HelpRequestType = 'call_waiter' | 'ask_for_bill' | 'order_problem' | 'payment_problem' | 'other'
export type HelpRequestStatus = 'open' | 'acknowledged' | 'resolved' | 'cancelled'
export type OrderProblemType = 'wrong_item' | 'missing_item' | 'cold' | 'not_as_expected' | 'taking_too_long' | 'other'
export type HelpResolution = 'remake' | 'comp' | 'void' | 'no_action'

// Legacy (kept for backwards compat with old payments table)
export type PaymentMethod = 'card' | 'cash'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export interface Venue {
  id: string
  name: string
  slug: string
  logo_url: string | null
  address: string | null
  phone: string | null
  currency: string
  timezone: string
  code_length: number
  session_timeout_min: number
  inactivity_timeout_min: number
  max_code_attempts: number
  request_escalate_min: number
  rate_limit_requests: number
  kitchen_open: boolean
  stripe_account_id: string | null
  allow_cash: boolean
  allow_card: boolean
  owner_id: string | null
  setup_progress: Record<string, boolean> | null
  // Migration 006
  payment_mode: PaymentMode
  hybrid_max_unpaid: number | null
  tax_rate: number
  service_charge_rate: number
  tip_enabled: boolean
  tip_presets: number[]
  // Payment secrets moved to venue_secrets table (migration 012)
  // mpesa_shortcode kept here only as nullable hint for the RPC return
  mpesa_shortcode: string | null
  close_override_requires_manager: boolean
  created_at: string
  updated_at: string
}

export interface RestaurantTable {
  id: string
  venue_id: string
  table_number: string
  label: string | null
  capacity: number | null
  status: TableStatus
  qr_token: string
  // Migration 008
  table_slug: string | null
  created_at: string
}

export interface Staff {
  id: string
  venue_id: string
  user_id: string | null
  email: string
  name: string
  role: StaffRole
  active: boolean
  invited_at: string
  joined_at: string | null
  created_at: string
  pin_hash: string | null
  pin_attempts: number
  on_duty: boolean
  last_active_at: string | null
}

export interface TableSession {
  id: string
  venue_id: string
  table_id: string
  opened_by: string | null
  closed_by: string | null
  opened_at: string
  closed_at: string | null
  current_code: string | null
  code_expires_at: string | null
  code_attempts: number
  code_locked: boolean
  is_active: boolean
  last_activity: string
  // Migration 008
  code_locked_until: string | null
  parked_at: string | null
  parked_by: string | null
  park_reason: string | null
  settled_at: string | null
  idle_timeout_min: number | null
  presence_confirmed_until: string | null
  // Migration 010
  waiter_managed: boolean
}

export interface SessionDevice {
  id: string
  session_id: string
  device_token: string
  device_label: string | null
  joined_at: string
  revoked_at: string | null
  is_active: boolean
  // Migration 008
  last_seen: string | null
}

export interface TableRequest {
  id: string
  venue_id: string
  table_id: string
  device_token: string
  ip_address: string | null
  status: 'pending' | 'approved' | 'denied' | 'expired'
  handled_by: string | null
  requested_at: string
  handled_at: string | null
  session_id: string | null
  assigned_waiter_id: string | null
  escalated_at: string | null
}

export interface MenuCategory {
  id: string
  venue_id: string
  name: string
  description: string | null
  sort_order: number
  active: boolean
  created_at: string
}

export interface MenuItem {
  id: string
  venue_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  sort_order: number
  available: boolean
  allergens: string[] | null
  prep_time_min: number | null
  created_at: string
  updated_at: string
}

export interface ItemOption {
  id: string
  item_id: string
  group_name: string
  required: boolean
  multi_select: boolean
  // Migration 010
  min_selections: number
  max_selections: number | null
  sort_order: number
  choices?: ItemOptionChoice[]
}

export interface ItemOptionChoice {
  id: string
  option_id: string
  label: string
  price_delta: number
  // Migration 010
  available: boolean
  is_default: boolean
  sort_order: number
}

export interface Order {
  id: string
  venue_id: string
  table_id: string
  session_id: string
  device_token: string
  order_number: string
  status: OrderStatus
  notes: string | null
  subtotal: number
  idempotency_key: string
  placed_at: string
  updated_at: string
  // Migration 010
  source: OrderSource
  placed_by: string | null
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  item_id: string
  item_name: string
  item_price: number
  quantity: number
  notes: string | null
  options: Record<string, string> | null
  line_total: number
  // Migration 006
  payment_status: ItemPaymentStatus
  paid_by_payment_id: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: VoidReason | null
  void_note: string | null
  comped_at: string | null
  comped_by: string | null
  comp_reason: CompReason | null
  comp_note: string | null
  // Migration 010
  station_id: string | null
  line_status: LineStatus
  allergy_flag: boolean
  allergy_note: string | null
}

// ── Payment V2 (migration 006) ───────────────────────────────

export interface PaymentV2 {
  id: string
  venue_id: string
  session_id: string
  table_id: string
  device_token: string
  method: PaymentMethodV2
  state: PaymentState
  subtotal: number
  tax_amount: number
  service_charge_amount: number
  tip_amount: number
  total: number
  split_type: SplitType | null
  split_of: number | null
  custom_amount: number | null
  provider_ref: string | null
  provider_payload: Record<string, unknown> | null
  idempotency_key: string
  receipt_number: string | null
  receipt_sent_at: string | null
  initiated_at: string
  confirmed_at: string | null
  failed_at: string | null
  cash_received: number | null
  change_due: number | null
  recorded_by: string | null
  override_by: string | null
  override_reason: OverrideReason | null
  override_note: string | null
  created_at: string
}

export interface PaymentItem {
  id: string
  payment_id: string
  order_item_id: string
  amount: number
  created_at: string
}

export interface ItemReservation {
  id: string
  session_id: string
  order_item_id: string
  device_token: string
  expires_at: string
  created_at: string
}

export interface SessionCloseOverride {
  id: string
  session_id: string
  venue_id: string
  outstanding: number
  reason: OverrideReason
  note: string | null
  approved_by: string | null
  created_by: string
  created_at: string
}

export interface Receipt {
  id: string
  payment_id: string
  venue_id: string
  receipt_number: string
  data: Record<string, unknown>
  created_at: string
}

// ── Computed bill (returned by compute_bill RPC) ─────────────

export interface BillItem {
  order_item_id: string
  order_id: string
  order_number: string
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  notes: string | null
  options: Record<string, string> | null
  payment_status: ItemPaymentStatus
  paid_by: string | null
  void_reason: VoidReason | null
  comp_reason: CompReason | null
}

export interface ComputedBill {
  session_id: string
  venue_id: string
  items: BillItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  service_charge_rate: number
  service_charge_amount: number
  total: number
  paid: number
  voided: number
  comped: number
  outstanding: number
  payment_mode: PaymentMode
  tip_enabled: boolean
  tip_presets: number[]
  is_settled: boolean
}

export interface InitiatePaymentResult {
  success: boolean
  payment_id?: string
  subtotal?: number
  tax_amount?: number
  service_charge_amount?: number
  tip_amount?: number
  total?: number
  idempotency_key?: string
  mpesa_shortcode?: string | null
  message?: string
  already_exists?: boolean
}

export interface ReconciliationReport {
  period_from: string
  period_to: string
  by_method: { method: string; count: number; total: number; tips: number }[]
  totals: {
    payments: number
    gross: number
    tips: number
    refunds: number
    failed_count: number
    cancelled_count: number
  }
  voids: {
    item_name: string; line_total: number; void_reason: string;
    void_note: string | null; voided_at: string; voided_by_name: string;
    order_number: string; table_number: string
  }[]
  comps: {
    item_name: string; line_total: number; comp_reason: string;
    comp_note: string | null; comped_at: string; comped_by_name: string;
    order_number: string
  }[]
  overrides: {
    outstanding: number; reason: string; note: string | null;
    created_at: string; closed_by_name: string; table_number: string
  }[]
  unpaid_tabs: {
    table_number: string; opened_at: string; closed_at: string;
    outstanding: number; opened_by_name: string
  }[]
}

// ── App-level types ───────────────────────────────────────────

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  notes: string
  options: Record<string, string>
  optionsDelta: number
  lineTotal: number
}

export interface TableWithSession extends RestaurantTable {
  active_session?: TableSession | null
  pending_requests?: number
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
  table_number?: string
}

// ── Migration 005 tables ──────────────────────────────────────

export interface PairedDevice {
  id: string
  venue_id: string
  device_token: string
  device_label: string | null
  pairing_code: string
  pairing_expires_at: string | null
  paired_at: string | null
  last_used_at: string | null
  locked: boolean
  locked_at: string | null
  created_at: string
}

export interface StaffTableAssignment {
  id: string
  staff_id: string
  table_id: string
  section_id: string | null
  shift: 'morning' | 'evening' | 'all_day'
  created_at: string
}

export interface Section {
  id: string
  venue_id: string
  name: string
  sort_order: number
  created_at: string
}

// ── Migration 010 tables ──────────────────────────────────────

export interface KitchenStation {
  id: string
  venue_id: string
  name: string
  color: string
  sort_order: number
  is_default: boolean
  target_prep_min: number
  active: boolean
  created_at: string
}

export interface StaffStationAssignment {
  id: string
  staff_id: string
  station_id: string
  created_at: string
}

export interface HelpRequest {
  id: string
  venue_id: string
  session_id: string
  table_id: string
  device_token: string
  request_type: HelpRequestType
  status: HelpRequestStatus
  order_id: string | null
  order_item_id: string | null
  problem_type: OrderProblemType | null
  note: string | null
  assigned_to: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution: HelpResolution | null
  resolution_note: string | null
  created_at: string
  expires_at: string | null
  cancelled_at: string | null
}

export interface WaiterOrderItem {
  item_id: string
  item_name: string
  item_price: number
  quantity: number
  notes: string
  options: Record<string, string>
  options_delta: number
  allergy_flag: boolean
  allergy_note: string
}

// ── Migration 012 ─────────────────────────────────────────────

export interface VenueSecrets {
  venue_id: string
  mpesa_shortcode: string | null
  mpesa_passkey: string | null
  mpesa_consumer_key: string | null
  mpesa_consumer_secret: string | null
  webhook_secret: string | null
  stripe_secret_key: string | null
  updated_at: string
}
