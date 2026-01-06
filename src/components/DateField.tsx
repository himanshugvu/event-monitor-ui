import type { DayMode } from "../types";
import { CalendarPicker } from "./CalendarPicker";

export function DateField({
  day,
  onDayChange,
  onDayModeChange,
}: {
  day: string;
  onDayChange: (value: string) => void;
  onDayModeChange: (value: DayMode) => void;
}) {
  return (
    <CalendarPicker
      value={day}
      onChange={(value) => {
        onDayModeChange("custom");
        onDayChange(value);
      }}
      placeholder="Select date"
      className="date-field"
      showIcon
    />
  );
}
