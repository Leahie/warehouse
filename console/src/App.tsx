import { DatabasePane } from "./panes/DatabasePane";
import { SearchPane } from "./panes/SearchPane";
import { VoicePane } from "./panes/VoicePane";
import "./styles.css";

export function App() {
  return (
    <main>
      <header>
        <h1>DockCheck</h1>
        <p>Local receiving clerk. UI paints Mongo. It does not compute matches.</p>
      </header>
      <div className="grid">
        <VoicePane />
        <DatabasePane />
        <SearchPane />
      </div>
    </main>
  );
}
