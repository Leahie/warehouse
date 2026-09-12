export type OrderStatus =
  | "awaiting"
  | "pending_clarification"
  | "committed"
  | "flagged"
  | "pending_match";

export type OrderRow = {
  order_id: string;
  date: string;
  time_process_finished: string;
  item: string;
  quantity_received: number;
  quantity_expected: number;
  quality: string | null;
  supplier: string;
  lot_code: string;
  industry?: string;
  status: OrderStatus;
  flagged_by?: string | null;
};
