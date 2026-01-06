import { useEffect, useRef, useState } from "react";

export function RefreshMenu({
  onRefresh,
  onHardRefresh,
  updatedText,
}: {
  onRefresh: () => void;
  onHardRefresh: () => void;
  updatedText?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (event: globalThis.MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="refresh-stack" ref={containerRef}>
      <button
        className="button primary"
        onClick={onRefresh}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span className="material-symbols-outlined">refresh</span>
        Refresh
      </button>
      {updatedText ? <span className="updated-inline">{updatedText}</span> : null}
      {open ? (
        <div className="refresh-menu">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            Refresh day
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onHardRefresh();
            }}
          >
            Hard refresh (7 days)
          </button>
        </div>
      ) : null}
    </div>
  );
}
