export type DateTimeString = string;

export type UserRole =
    | 'admin'
    | 'sales'
    | 'designer'
    | 'production_manager'
    | 'worker'
    | 'qc'
    | 'finance';

export type StationDepartment =
    | 'none'
    | 'design'
    | 'print'
    | 'embroidery'
    | 'screen'
    | 'flex'
    | 'cutting'
    | 'sewing'
    | 'qc';

export type OrderStatus =
    | 'draft'
    | 'designing'
    | 'waiting_customer_confirm'
    | 'confirmed'
    | 'in_production'
    | 'qc_checking'
    | 'qc_rejected'
    | 'shipping'
    | 'completed'
    | 'cancelled';

export type SizeGroup = 'kids' | 'adults' | 'oversize';

export type SewingTargetGroup = 'ADULT' | 'CHILD';

export type RoutingStationName =
    | 'design'
    | 'print'
    | 'embroidery'
    | 'screen'
    | 'flex'
    | 'cutting'
    | 'sewing'
    | 'qc'
    | 'shipping';

export type RoutingStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'rejected';

export type CuttingOrderStatus = 'draft' | 'cutting' | 'inspected' | 'completed';

export type PaymentType = 'deposit' | 'partially_paid' | 'full_payment' | 'balance_clear';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'cheque';

export interface Customer {
    id: number;
    customer_code: string;
    customer_name: string;
    phone: string | null;
    line_fb: string | null;
    address: string | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;
    deleted_at: DateTimeString | null;

    orders?: Order[];
}

export interface Branch {
    id: number;
    branch_code: string;
    branch_name: string;
    phone: string | null;
    address: string | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    orders?: Order[];
}

export interface User {
    id: number;
    name: string;
    email: string;
    email_verified_at: DateTimeString | null;
    password: string;
    role: UserRole;
    station_department: StationDepartment;
    remember_token: string | null;
    two_factor_secret: string | null;
    two_factor_recovery_codes: string | null;
    two_factor_confirmed_at: DateTimeString | null;
    current_team_id: number | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    created_orders?: Order[];
    status_histories?: OrderStatusHistory[];
    assigned_routings?: OrderRouting[];
    cashier_receipts?: Receipt[];
    cutting_orders_as_cutter?: CuttingOrder[];
    cutting_orders_as_inspector?: CuttingOrder[];
    cutting_worker_tasks?: CuttingWorkerTask[];
}

export interface Order {
    id: number;
    order_code: string;
    customer_id: number;
    branch_id: number;
    creator_user_id: number;
    job_name: string;
    job_type: string;
    delivery_method: string | null;
    shipping_address: string | null;
    shipping_delivery_info?: {
        carrier_name: string;
        tracking_no: string;
        parcel_weight_kg: string;
        parcel_shipping_cost: string;
        onsite_sender_name: string;
        onsite_vehicle_plate: string;
        sender_signature: string;
    } | null;
    order_date: DateTimeString;
    due_date: DateTimeString;
    total_amount: number;
    discount_percent: number;
    discount_amount: number;
    net_amount: number;
    order_status: OrderStatus;
    artwork_url?: string | null;
    shirt_artwork_url?: string | null;
    pants_artwork_url?: string | null;
    shirt_artwork_urls?: string[];
    sports_day_artwork_urls?: Record<string, string[]>;
    pants_artwork_urls?: string[];
        delivery_method: string | null;
        shipping_address: string | null;
    reference_designs?: string[];
    created_at: DateTimeString;
    updated_at: DateTimeString;
    deleted_at: DateTimeString | null;

    customer?: Customer;
    branch?: Branch;
    creator_user?: User;
    specification?: OrderSpecification;
    items?: OrderItem[];
    status_histories?: OrderStatusHistory[];
    routings?: OrderRouting[];
    receipts?: Receipt[];
    cutting_orders?: CuttingOrder[];
}

export interface OrderSpecification {
    id: number;
    order_id: number;
    pattern_id: number | null;
    fabric_id: number | null;
    neck_style_id: number | null;
    collar_color: string | null;
    leg_style: string | null;
    leg_hem: string | null;
    placket_style: string | null;
    placket_color: string | null;
    sleeve_style: string | null;
    sleeve_hem: string | null;
    sublimation_detail: string | null;
    screen_print_detail: string | null;
    embroidery_code: string | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order?: Order;
}

export interface OrderItem {
    id: number;
    order_id: number;
    item_type: string;
    size_group: SizeGroup;
    size_label: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order?: Order;
}

export interface OrderStatusHistory {
    id: number;
    order_id: number;
    user_id: number;
    from_status: OrderStatus;
    to_status: OrderStatus;
    remark: string | null;
    created_at: DateTimeString;

    order?: Order;
    user?: User;
}

export interface OrderRouting {
    id: number;
    order_id: number;
    station_name: RoutingStationName;
    is_required: boolean;
    status: RoutingStatus;
    print_machine: 'printer_1' | 'printer_2' | 'printer_3' | null;
    assigned_user_id: number | null;
    cutting_team_id: number | null;
    sewing_team_id: number | null;
    embroidery_team_id: number | null;
    screen_team_id: number | null;
    heat_press_machine_id: number | null;
    rework_note: string | null;
    started_at: DateTimeString | null;
    completed_at: DateTimeString | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order?: Order;
    assigned_user?: User;
    cutting_team?: CuttingTeam;
    sewing_team?: SewingTeam;
    embroidery_team?: EmbroideryTeam;
    screen_team?: ScreenTeam;
    heat_press_machine?: HeatPressMachine;
}

export interface CuttingTeam {
    id: number;
    team_name: string;
    is_active: boolean;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order_routings?: OrderRouting[];
}

export interface SewingTeam {
    id: number;
    team_name: string;
    is_active: boolean;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order_routings?: OrderRouting[];
}

export interface EmbroideryTeam {
    id: number;
    team_name: string;
    is_active: boolean;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order_routings?: OrderRouting[];
}

export interface ScreenTeam {
    id: number;
    team_name: string;
    station_name: 'screen' | 'flex';
    is_active: boolean;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order_routings?: OrderRouting[];
}

export interface HeatPressMachine {
    id: number;
    machine_name: string;
    is_active: boolean;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order_routings?: OrderRouting[];
}

export interface PieceworkPrice {
    id: number;
    code: string;
    name: string;
    price_per_unit: number;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    cutting_worker_tasks?: CuttingWorkerTask[];
}

export interface ShirtType {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    sewing_operations?: SewingOperation[];
}

export interface SewingOperation {
    id: number;
    shirt_type_id: number;
    target_group: SewingTargetGroup;
    name: string;
    price: number;
    is_active: boolean;
    display_order: number;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    shirt_type?: ShirtType;
}

export interface CuttingOrder {
    id: number;
    cutting_code: string;
    order_id: number;
    cutter_user_id: number;
    inspector_user_id: number | null;
    start_date: DateTimeString;
    completed_date: DateTimeString | null;
    status: CuttingOrderStatus;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    order?: Order;
    cutter_user?: User;
    inspector_user?: User;
    worker_tasks?: CuttingWorkerTask[];
}

export interface CuttingWorkerTask {
    id: number;
    cutting_order_id: number;
    price_master_id: number;
    worker_user_id: number;
    quantity_done: number;
    total_wage: number;
    created_at: DateTimeString;
    updated_at: DateTimeString;

    cutting_order?: CuttingOrder;
    price_master?: PieceworkPrice;
    worker_user?: User;
}

export interface Receipt {
    id: number;
    receipt_code: string;
    order_id: number;
    cashier_user_id: number;
    payment_date: DateTimeString;
    payment_type: PaymentType;
    payment_method: PaymentMethod;
    amount_paid: number;
    note: string | null;
    created_at: DateTimeString;
    updated_at: DateTimeString;
    deleted_at: DateTimeString | null;

    order?: Order;
    cashier_user?: User;
}
