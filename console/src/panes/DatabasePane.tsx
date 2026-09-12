import { useEffect, useState } from "react";
import { fetchAlerts, fetchPapers, type Alert, type PaperRow } from "../hooks/useEvents";
import { useEventStream } from "../hooks/useEventStream";

export function DatabasePane() {
  const events = useEventStream("database");
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    function refresh() {
      fetchPapers().then(setPapers);
      fetchAlerts().then(setAlerts);
    }
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [events.length]);

  async function flag(orderId: string) {
    await fetch(`/api/orders/${orderId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "marked invalid by supervisor", source: "supervisor" }),
    });
    setPapers(await fetchPapers());
    setAlerts(await fetchAlerts());
  }

  const alerted = new Set(alerts.map((alert) => alert.order_id));

  return (
    <section className="pane">
      <h2>Database</h2>
      <div className="alerts">
        {alerts.length === 0 ? (
          <p className="muted">No open alerts.</p>
        ) : (
          alerts.map((alert) => (
            <p key={alert.alert_id} className="alert-banner">
              {alert.alert_id}: {alert.reason} ({alert.order_id})
            </p>
          ))
        )}
      </div>
      <h3>On file (PO + bill of lading)</h3>
      <table>
        <thead>
          <tr>
            <th>PO</th>
            <th>BOL</th>
            <th>Item</th>
            <th>PO / BOL qty</th>
            <th>Papers</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((row) => (
            <tr key={`${row.po_id}-${row.item}`}>
              <td>{row.po_id}</td>
              <td>{row.bol_id || "—"}</td>
              <td>{row.item}</td>
              <td>
                {row.quantity_po} / {row.quantity_bol ?? "—"}
              </td>
              <td>{row.po_vs_bol}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>On the dock (packing slip)</h3>
      <table>
        <thead>
          <tr>
            <th>Slip</th>
            <th>Item</th>
            <th>Slip vs on file</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {papers.map((row) => (
            <tr
              key={`dock-${row.po_id}-${row.item}`}
              className={row.status === "flagged" || (row.order_id && alerted.has(row.order_id)) ? "row-alert" : ""}
            >
              <td>{row.slip_id || "waiting"}</td>
              <td>{row.item}</td>
              <td>
                {row.quantity_slip ?? "—"} / {row.quantity_po}
              </td>
              <td>{row.status || "on file"}</td>
              <td>
                {row.order_id && row.status !== "flagged" ? (
                  <button type="button" onClick={() => flag(row.order_id!)}>
                    Flag
                  </button>
                ) : (
                  row.flag_reason || ""
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Log stream</h3>
      <ol className="transcript">
        {events.map((event) => (
          <li key={event.seq} className={`line ${event.kind}`}>
            <span className="kind">{event.kind}</span>
            <span className="body">
              {event.entity_id}
              {event.payload.doc_type ? ` ${String(event.payload.doc_type)}` : ""}
              {event.payload.item ? ` ${String(event.payload.item)}` : ""}
              {event.payload.quantity != null ? ` qty ${String(event.payload.quantity)}` : ""}
              {event.payload.quantity_received != null
                ? ` ${String(event.payload.quantity_received)}/${String(event.payload.quantity_expected ?? "?")}`
                : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
