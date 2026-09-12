import { useEffect, useState } from "react";
import { fetchOrders, type Order } from "../hooks/useEvents";
import { useEventStream } from "../hooks/useEventStream";

export function DatabasePane() {
  const events = useEventStream("database");
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetchOrders().then(setOrders);
    const id = window.setInterval(() => fetchOrders().then(setOrders), 1500);
    return () => window.clearInterval(id);
  }, [events.length]);

  async function flag(orderId: string) {
    await fetch(`/api/orders/${orderId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "marked invalid by supervisor", source: "supervisor" }),
    });
    setOrders(await fetchOrders());
  }

  const liveOrders = orders.length
    ? orders
    : events
        .filter((event) => event.kind === "order_upserted" || event.kind === "order_flagged")
        .map((event) => ({
          order_id: event.entity_id,
          status: String(event.payload.status || (event.kind === "order_flagged" ? "flagged" : "")),
          item: String(event.payload.item || ""),
          quantity_received: Number(event.payload.quantity_received || 0),
          quantity_expected: Number(event.payload.quantity_expected || 0),
          flag_reason: String(event.payload.flag_reason || ""),
        }));

  return (
    <section className="pane">
      <h2>Database</h2>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Item</th>
            <th>Received / expected</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liveOrders.map((order) => (
            <tr key={order.order_id} className={order.status === "flagged" ? "row-alert" : ""}>
              <td>{order.order_id}</td>
              <td>{order.item}</td>
              <td>
                {order.quantity_received} / {order.quantity_expected}
              </td>
              <td>{order.status}</td>
              <td>
                {order.status !== "flagged" ? (
                  <button type="button" onClick={() => flag(order.order_id)}>
                    Flag
                  </button>
                ) : (
                  order.flag_reason
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
