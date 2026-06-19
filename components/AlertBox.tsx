interface AlertBoxProps {
  type: 'warn' | 'good' | 'info';
  icon: string;
  title: string;
  body: string;
}

export function AlertBox({ type, icon, title, body }: AlertBoxProps) {
  const s = {
    warn: { bg: '#FAEEDA', border: '#EF9F27', color: '#633806' },
    good: { bg: '#EAF3DE', border: '#639922', color: '#27500A' },
    info: { bg: '#E6F1FB', border: '#85B7EB', color: '#0C447C' },
  }[type];

  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: s.color, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: s.color, lineHeight: 1.5, opacity: 0.9 }}>{body}</div>
      </div>
    </div>
  );
}