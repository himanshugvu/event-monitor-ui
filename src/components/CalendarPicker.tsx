import { useEffect, useMemo, useRef, useState } from "react";

type CalendarPickerProps = {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
  showIcon?: boolean;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, index) => pad2(index));
const MINUTES = Array.from({ length: 60 }, (_, index) => pad2(index));
const SECONDS = Array.from({ length: 60 }, (_, index) => pad2(index));

const toDateValue = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toTimeValue = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const parseDateTime = (value: string) => {
  const [datePart, timePart] = value.split("T");
  const date = parseDateOnly(datePart);
  if (!date) {
    return null;
  }
  if (timePart) {
    const [hour, minute, second] = timePart.split(":").map((part) => Number(part));
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      date.setHours(hour, minute, Number.isFinite(second) ? second : 0, 0);
    }
  }
  return date;
};

type TimeParts = {
  hour: string;
  minute: string;
  second: string;
};

const buildTimeParts = (date?: Date | null): TimeParts => {
  if (!date) {
    return { hour: "00", minute: "00", second: "00" };
  }
  const hour24 = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return { hour: pad2(hour24), minute: pad2(minute), second: pad2(second) };
};

const normalizeTimeParts = (parts: TimeParts): TimeParts => {
  const hourValue = Number(parts.hour);
  const minuteValue = Number(parts.minute);
  const secondValue = Number(parts.second);
  const hour =
    Number.isFinite(hourValue) && hourValue >= 0 && hourValue <= 23 ? hourValue : 0;
  const minute =
    Number.isFinite(minuteValue) && minuteValue >= 0 && minuteValue <= 59 ? minuteValue : 0;
  const second =
    Number.isFinite(secondValue) && secondValue >= 0 && secondValue <= 59 ? secondValue : 0;
  return { hour: pad2(hour), minute: pad2(minute), second: pad2(second) };
};

const formatDisplay = (date: Date, withTime?: boolean) => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  if (withTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.second = "2-digit";
    options.hour12 = false;
  }
  return new Intl.DateTimeFormat("en-GB", options).format(date);
};

export function CalendarPicker({
  value,
  onChange,
  withTime = false,
  placeholder = "Select date",
  className,
  showIcon = false,
}: CalendarPickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const parsedValue = useMemo(() => {
    if (!value) {
      return null;
    }
    return withTime ? parseDateTime(value) : parseDateOnly(value);
  }, [value, withTime]);
  const [draftDate, setDraftDate] = useState<Date>(() => parsedValue ?? new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parsedValue ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [timeParts, setTimeParts] = useState<TimeParts>(() => buildTimeParts(parsedValue));

  useEffect(() => {
    if (!open) {
      return;
    }
    const base = parsedValue ?? new Date();
    setDraftDate(base);
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setTimeParts(buildTimeParts(parsedValue));
  }, [open, parsedValue]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current || !event.target) {
        return;
      }
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const updateAlignment = () => {
      const popover = popoverRef.current;
      if (!popover) {
        return;
      }
      const rect = popover.getBoundingClientRect();
      const overflowRight = rect.right > window.innerWidth - 8;
      const overflowLeft = rect.left < 8;
      if (overflowRight && !overflowLeft) {
        setAlignRight(true);
        return;
      }
      if (overflowLeft) {
        setAlignRight(false);
        return;
      }
      setAlignRight(false);
    };
    const raf = window.requestAnimationFrame(updateAlignment);
    window.addEventListener("resize", updateAlignment);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateAlignment);
    };
  }, [open, withTime]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(viewMonth),
    [viewMonth]
  );

  const days = useMemo(() => {
    const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startOffset = start.getDay();
    const total = 42;
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - startOffset + index);
      const isCurrent = date.getMonth() === viewMonth.getMonth();
      return { date, isCurrent };
    });
  }, [viewMonth]);

  const isSelected = (date: Date) =>
    date.getFullYear() === draftDate.getFullYear() &&
    date.getMonth() === draftDate.getMonth() &&
    date.getDate() === draftDate.getDate();

  const isToday = (date: Date) => {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  };

  const applySelection = (date: Date) => {
    const next = new Date(date);
    if (withTime) {
      const normalized = normalizeTimeParts(timeParts);
      const hour24 = Number(normalized.hour);
      const minute = Number(normalized.minute);
      const second = Number(normalized.second);
      next.setHours(hour24, minute, second, 0);
      onChange(`${toDateValue(next)}T${pad2(hour24)}:${pad2(minute)}:${pad2(second)}`);
    } else {
      onChange(toDateValue(next));
    }
    setOpen(false);
  };

  const handleApply = () => {
    applySelection(draftDate);
  };

  const displayDate = useMemo(() => {
    if (withTime && open) {
      const next = new Date(draftDate);
      const normalized = normalizeTimeParts(timeParts);
      next.setHours(
        Number(normalized.hour),
        Number(normalized.minute),
        Number(normalized.second),
        0
      );
      return next;
    }
    return parsedValue;
  }, [draftDate, open, parsedValue, timeParts, withTime]);

  const displayText = displayDate ? formatDisplay(displayDate, withTime) : "";

  return (
    <div className={`calendar-picker${className ? ` ${className}` : ""}`} ref={wrapperRef}>
      <button
        className="calendar-trigger"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {showIcon ? <span className="material-symbols-outlined">calendar_today</span> : null}
        <span className={`calendar-value${displayText ? "" : " placeholder"}`}>
          {displayText || placeholder}
        </span>
      </button>
      {open ? (
        <div
          className={`calendar-popover${withTime ? " with-time" : ""}${
            alignRight ? " align-right" : ""
          }`}
          role="dialog"
          ref={popoverRef}
        >
          <div className="calendar-header">
            <button
              className="calendar-nav"
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                )
              }
              aria-label="Previous month"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span className="calendar-month">{monthLabel}</span>
            <button
              className="calendar-nav"
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                )
              }
              aria-label="Next month"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <div className={`calendar-body${withTime ? " with-time" : ""}`}>
            <div className="calendar-date">
              <div className="calendar-weekdays">
                {WEEKDAYS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {days.map(({ date, isCurrent }) => (
                  <button
                    key={date.toISOString()}
                    type="button"
                    className={`calendar-day${isCurrent ? "" : " muted"}${
                      isSelected(date) ? " selected" : ""
                    }${isToday(date) ? " today" : ""}`}
                    onClick={() => {
                      setDraftDate(date);
                      if (date.getMonth() !== viewMonth.getMonth()) {
                        setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                      }
                      if (!withTime) {
                        applySelection(date);
                      }
                    }}
                    onDoubleClick={() => {
                      if (withTime) {
                        applySelection(date);
                      }
                    }}
                  >
                    {date.getDate()}
                  </button>
                ))}
              </div>
            </div>
            {withTime ? (
              <div className="calendar-time-panel">
                <div className="calendar-time-label">Time</div>
                <div className="calendar-time-columns">
                  <div className="calendar-time-column">
                    {HOURS.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        className={`calendar-time-option${timeParts.hour === hour ? " active" : ""}`}
                        onClick={() => setTimeParts((current) => ({ ...current, hour }))}
                      >
                        {hour}
                      </button>
                    ))}
                  </div>
                  <div className="calendar-time-column">
                    {MINUTES.map((minute) => (
                      <button
                        key={minute}
                        type="button"
                        className={`calendar-time-option${timeParts.minute === minute ? " active" : ""}`}
                        onClick={() => setTimeParts((current) => ({ ...current, minute }))}
                      >
                        {minute}
                      </button>
                    ))}
                  </div>
                  <div className="calendar-time-column">
                    {SECONDS.map((second) => (
                      <button
                        key={second}
                        type="button"
                        className={`calendar-time-option${timeParts.second === second ? " active" : ""}`}
                        onClick={() => setTimeParts((current) => ({ ...current, second }))}
                      >
                        {second}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="calendar-footer">
            <button className="button ghost small" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="button primary small" type="button" onClick={handleApply}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
