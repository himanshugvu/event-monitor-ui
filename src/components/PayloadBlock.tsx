import { formatPayload } from "../utils/format";

export function PayloadBlock({ title, value }: { title: string; value?: string }) {
  const payload = formatPayload(value);
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard && payload.length > 0;

  const handleCopy = async () => {
    if (!canCopy) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="payload-block">
      <div className="section-header">
        <h4>{title}</h4>
        <button className="link-button" onClick={handleCopy} disabled={!canCopy}>
          <span className="material-symbols-outlined">content_copy</span>
          Copy JSON
        </button>
      </div>
      {payload ? (
        <pre className="code-block">{payload}</pre>
      ) : (
        <div className="empty-state">No payload available.</div>
      )}
    </div>
  );
}
