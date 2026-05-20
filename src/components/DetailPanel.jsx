import { useEffect, useRef } from 'react';

export default function DetailPanel({ detail, onDismiss }) {
  const panelRef = useRef(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [detail?.nodeId, detail?.legendCategory, detail?.content]);

  if (!detail?.content) return null;

  return (
    <section
      ref={panelRef}
      className="detail-panel"
      aria-label="Chart details"
    >
      <div className="detail-panel__header">
        <span className="detail-panel__title">Details</span>
        <button
          type="button"
          className="detail-panel__close"
          aria-label="Close details"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <div className="detail-panel__body">
        {detail.content}
        <p className="tt-dismiss-hint detail-panel__hint">
          Click a name in the list to jump to that donor or party on the graph. Press Escape or × to close.
        </p>
      </div>
    </section>
  );
}
