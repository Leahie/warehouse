# Page 4 — Voice Visualizer (Voice Demo)

> Conversation-style voice logging UI. Status pipeline: **Parsing → Confirming → Correction → Logging data → Summary**, then archive to a left sidebar and open the next chat.

Whiteboard: voice → text, grey→blue when parsed, sidebar tabs with summaries; alert logs in red.

---

## Goal

Make the agent’s receive/clarify loop **watchable** like a text thread, suitable for a demo even when the real mic pipeline is stubbed.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ WareInHouse                                           [☰]   │
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │  Active conversation                         │
│              │                                              │
│ ● Romaine…   │  [Agent] Parsing…                            │
│ ● Strawber…  │                                              │
│ ■ Alert: …   │      [User] …          ← speaking            │
│              │      [User] 40 cases…  ← parsed (blue)       │
│              │                                              │
│              │  [Agent] Confirming…                         │
│              │  [Agent] You said 40, PO expected 50 — …     │
│              │                                              │
│              │      [User] yeah only 40…                    │
│              │                                              │
│              │  [Agent] Correction… / Logging data…         │
│              │  [Agent] Summary of user input               │
│              │                                              │
│              │                         [Next log →]         │
└──────────────┴──────────────────────────────────────────────┘
```

| Region | Width | Role |
|--------|-------|------|
| Left sidebar | ~240–280px | Past conversations (tabs), newest on top |
| Main thread | flex | Active chat |

---

## Status machine (agent)

Ordered stages (continuity):

| # | Status label | When |
|---|--------------|------|
| 1 | **Parsing** | User is speaking / utterance being transcribed |
| 2 | **Confirming** | Agent asks clarification or confirms slots |
| 3 | **Correction** | User adjusts a field / answers clarification |
| 4 | **Logging data** | Writing structured result toward DB |
| 5 | **Done** | Agent posts **summary of user input**; conversation freezes |

UI shows the **current** status as a persistent chip or agent system line near the top of the thread (“Parsing…” → “Confirming…” → …).

---

## User bubble states

| Phase | Bubble look | Content |
|-------|-------------|---------|
| Speaking | Grey (`#E5E8E4`), tertiary text | Animated `...` |
| Parsed | **Blue** tint (`#D6E6F5`), primary text | Final utterance / parsed phrase |
| Transition | 200ms color morph | Matches whiteboard “grey → blue parsed!” |

Agent bubbles use **brown-soft** surface to distinguish figure (agent) vs user.

---

## End of conversation

1. Agent message: **summary of user input** (structured prose or bullet slots: item, qty, lot, supplier).  
2. Thread marked complete.  
3. Entry appears in **left sidebar** with a **short summary** title.  
4. If this log produced / is linked to an **alert**, sidebar item uses **red** treatment (`text-negative` + red wash / border).  
5. **New empty chat** opens automatically for the next job/log (“Next log”).

---

## Sidebar item

| Field | Spec |
|-------|------|
| Title | Truncated summary (e.g. “Romaine 40 · Fresh Farms”) |
| Meta | Relative time |
| Alert | Red style when `is_alert: true` |
| Click | Re-open read-only transcript; new chat remains available via “Next log” |

---

## Demo vs live data

For design / hackathon **without mic**:

- Drive the thread from `fixtures/voice_sessions.json` (scripted timeline).  
- Optional “Play demo” button advances stages.  

Later: subscribe to `GET /api/events?pane=voice` (`voice_received`, `voice_parsed`, `clarification_asked`, `answer_received`) per `contracts/visualizers.json` / `voice_loop.json`.

---

## Gestalt

- **Continuity**: status order and message flow top → bottom  
- **Similarity**: all user bubbles share shape; color encodes parse state  
- **Common region**: sidebar vs thread are two clear regions  
- **Focal point**: current agent status + latest bubble  
- **Figure–ground**: completed sidebar items recede; active thread is figure  

---

## View-model

```ts
type VoiceStage =
  | "parsing"
  | "confirming"
  | "correction"
  | "logging_data"
  | "done";

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  state?: "speaking" | "parsed";  // user only
  at: string;
};

type VoiceSession = {
  session_id: string;
  stage: VoiceStage;
  messages: ChatMessage[];
  summary: string | null;
  is_alert: boolean;
  order_id?: string;
  created_at: string;
};
```

---

## Acceptance criteria (design)

- [ ] Conversation layout (not a form wizard)  
- [ ] Four agent statuses + summary  
- [ ] User `...` then blue parsed bubble  
- [ ] Sidebar archive with red alert items  
- [ ] Auto new chat after completion  

---

## Open questions

1. Scripted “Play demo” only for v1, or always-on event stream?  
2. Can user start typing to simulate voice if mic unavailable? (**Proposal: yes, demo input**)  
3. Sidebar capacity / search needed for hackathon? (**Proposal: last 20 sessions, no search**)
