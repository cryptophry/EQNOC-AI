import { Check, Copy } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useApp } from '../App';

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((s, i) => {
    if (s.startsWith('`') && s.endsWith('`') && s.length > 2) return <code key={i}>{s.slice(1, -1)}</code>;
    if (s.startsWith('**') && s.endsWith('**') && s.length > 4) return <strong key={i}>{s.slice(2, -2)}</strong>;
    return <span key={i}>{s}</span>;
  });
}

function Code({ text }: { text: string }) {
  const { copy } = useApp();
  const [ok, setOk] = useState(false);
  return (
    <div className="md-code">
      <pre>{text}</pre>
      <button className="icon-btn" aria-label="Copy" onClick={() => { copy(text, 'AI-suggested command'); setOk(true); setTimeout(() => setOk(false), 900); }}>
        {ok ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/** A small, safe markdown renderer: builds React nodes only, never raw HTML. */
export default function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(<Code key={k++} text={buf.join('\n')} />);
    } else if (/^#{1,4}\s/.test(line)) {
      out.push(<h4 key={k++}>{inline(line.replace(/^#{1,4}\s+/, ''))}</h4>);
      i++;
    } else if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        <div className="tablewrap" key={k++}><table><thead><tr>{head.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead>
          <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, m) => <td key={m}>{inline(c)}</td>)}</tr>)}</tbody></table></div>,
      );
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const li = items.map((t, j) => <li key={j}>{inline(t)}</li>);
      out.push(ordered ? <ol key={k++}>{li}</ol> : <ul key={k++}>{li}</ul>);
    } else if (!line.trim()) {
      i++;
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) buf.push(lines[i++]);
      out.push(<p key={k++}>{inline(buf.join(' '))}</p>);
    }
  }
  return <div className="md">{out}</div>;
}
