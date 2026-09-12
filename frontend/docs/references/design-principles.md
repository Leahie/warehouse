# Design principles applied

Sources reviewed while drafting WareInHouse UI specs:

- [Gestalt principles in UX/UI](https://www.uxdesigninstitute.com/blog/gestalt-principles-ux-ui-design/)
- [Daily UI](https://www.dailyui.co/) — practice prompts for cards, tables, chat
- [Mobbin](https://mobbin.com/discover/apps/ios/latest) — pattern reference for feeds, filters, conversation UIs
- Evallos design-system / text-styling / software-system docs (structure for this folder)

## Mapping to WareInHouse

| Principle | Application |
|-----------|-------------|
| Proximity | Alert metadata grouped; Logs controls clustered |
| Similarity | Status colors identical on Logs + Database + Voice alert rows |
| Common region | Cards, table panel, chat bubbles, sidebar |
| Continuity | Alert timeline; voice status pipeline; stacked bar reading |
| Figure–ground | Green header vs sage page; white cards |
| Focal point | Alert reason; `!` badge; hover tooltips; current voice status |
| Closure | Partial scrollbar / fade suggests more alerts below |

## Theme constraint

Green + brown brand chrome. Avoid purple gradients, generic SaaS blue, and the common “cream + terracotta serif” AI-default look. Page ground is cool sage mist (`#F3F6F2`), not warm cream.
