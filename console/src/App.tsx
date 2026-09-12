import { DatabasePane } from "./panes/DatabasePane";
import { SearchPane } from "./panes/SearchPane";
import { VoicePane } from "./panes/VoicePane";
import "./styles.css";

export function App() {
  return (
    <main>
      <header>
        <h1>DockCheck</h1>
        <p>On file: PO + bill of lading. On the dock: packing slip the worker is looking at.</p>
      </header>
      <div className="grid">
        <VoicePane />
        <DatabasePane />
        <SearchPane />
      </div>
    </main>
  );
}
