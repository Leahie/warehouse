import { useState } from "react";

type Investigation = {
  investigation_id: string;
  status: string;
  verdict?: string;
  steps?: Array<{ n: number; action: string; hit: string; note: string }>;
};

export function SearchPane() {
  const [query, setQuery] = useState("where did the romaine count go wrong?");
  const [doc, setDoc] = useState<Investigation | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setError("");
    try {
      const created = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!created.ok) throw new Error("investigate endpoint not up");
      const { investigation_id } = await created.json();
      const found = await fetch(`/api/investigations/${investigation_id}`);
      setDoc(await found.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "search failed");
    }
  }

  return (
    <section className="pane">
      <h2>Forensic search</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit">Ask</button>
      </form>
      {error ? <p className="muted">{error}. API must be running for live search.</p> : null}
      {doc ? (
        <div>
          <p>{doc.verdict}</p>
          <ol>
            {(doc.steps || []).map((step) => (
              <li key={step.n}>
                {step.action} → {step.hit}: {step.note}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
