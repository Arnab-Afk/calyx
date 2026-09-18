# Design system — Calyx messaging (Sazabi ops HUD)

## World
Night NOC / ops chat. Charcoal void, crimson signal glass, scanline incident cards. Not Slack purple.

## Mode
Operate — channel messaging, Calyx alerts, telemetry charts, composer.

## Type
- Display / UI labels: **Chakra Petch** (`--font-display`)
- Body: **Barlow** (`--font-body`)

## Color (committed crimson)
| Token | Role |
|---|---|
| `#050506` / void | Page ground |
| `rgba(18,14,16,0.55)` | Message glass |
| `#e11d2e` | Primary action / severity / glow |
| `#ff3b4a` | Mentions |
| `#5ec8ff` | Hashtags / info |
| `#3dd68c` / `#f5c542` | OK / warn in charts |

## Components
- **User message:** glass bubble, crimson-tinted square avatar, white name + muted time
- **Calyx reply:** Slack-style bot row — red `C` avatar, **Calyx** + APP badge + time, markdown body with code chips; charts attach as a **separate** glass panel below (not inside the bubble)
- **Chart panels:** `rounded-2xl` glass; Chakra Petch for titles + hero metrics; Barlow for micro labels (uppercase tracking) and body; shared primitives in `charts/chart-ui.tsx` (SegmentedBar, SegmentedArc, StackedSegments, MiniBars, Subcard, LegendList)
- **Chart patterns:** segmented tick bars (signal strength), discrete arc gauges (task progress), donut + legend + mix bar (segments), metric tiles + mini bars (AUM), gradient tracks (portfolio health)
- **Composer:** dark glass, crimson Send
- **AlertCard:** incident variant with Impact / Root cause / Recommended action as uppercase labels (no tool chips)

## Do not
- Reintroduce Slack purple chrome
- Flat white message panes
- Green Slack send button
