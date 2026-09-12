export type AlertSeverity = "critical" | "warning" | "info";

export type AlertCard = {
  alert_id: string;
  order_id: string;
  reason: string;
  ai_summary: string;
  created_at: string;
  lot_code: string;
  supplier: string;
  severity: AlertSeverity;
};
