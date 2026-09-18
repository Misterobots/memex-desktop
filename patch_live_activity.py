from pathlib import Path
path = Path(__file__).parent / "src/components/chat/MessageBubble.tsx"
text = path.read_text(encoding="utf-8")
text = text.replace('import { StatusEvent }  from "./StatusEvent";\n', 'import { StatusEvent }  from "./StatusEvent";\nimport { LiveActivity } from "./LiveActivity";\n', 1)
old = '''        {statusEvents.length > 0 && (
          <div className="space-y-1">
            {statusEvents.map((e, i) => <StatusEvent key={i} event={e} />)}
          </div>
        )}
'''
new = '''        {isActive ? <LiveActivity events={events} active={true} waiting={isWaiting} /> : statusEvents.length > 0 && (
          <div className="space-y-1">{statusEvents.map((e, i) => <StatusEvent key={i} event={e} />)}</div>
        )}
'''
if old not in text: raise SystemExit("status render block missing")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
