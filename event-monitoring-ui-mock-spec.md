# UI Mockup Spec — Day-based Event Monitoring (Success/Failure tables)

## Goal
Design **2 screens**:
1) **Home (Global Aggregation)**: day-level aggregation across **ALL events** with drill-down to Event Details.
2) **Event Details**: select an event and view **aggregation on top** and switch between **Success** and **Failures** tables.

Assumptions:
- Events are **day-specific** (query by `day=YYYY-MM-DD`).
- Each event has **two physical tables**: Success + Failure.

---

## Navigation / IA
- **Home**
- **Event Details**

---

## Shared Components

### Day Selector (global)
- Label: **Day**
- Control: Today | Yesterday | Pick date
- Changing day refreshes current screen.

### Updated indicator
- Text: `Updated Xs ago`
- Button: `Refresh`

### KPI card
- Title (small)
- Value (large)
- Optional subtitle (small, optional later)

### Right Drawer (slide-over)
Used from row click in Success/Failures lists.
- Header: Trace ID + received time
- Sections: Metadata + Payload/Exception

---

## Screen 1 — Home (Global aggregation)

### Header
- Title: **Home / Events**
- Controls (right):
  - Day selector
  - Updated Xs ago
  - Refresh

### KPI row (for selected day, global)
Cards:
- Total Events
- Success
- Failures
- Success Rate %
- Retriable Failures
- Avg Latency (success only)
- (optional) P95 Latency

### Optional trend (small)
- Success vs Failures by hour (for selected day)

### Main table — “All Events Breakdown”
One row per event/topic.

Columns:
- Event/Topic (clickable)
- Total
- Success
- Failures
- Success %
- Retriable Failures
- Avg Latency
- (optional) P95 Latency
- CTA: **View Details**

Row behavior:
- Clicking row or **View Details** navigates to Screen 2 with:
  - same **Day**
  - selected **Event** pre-filled

### Optional “Failure Insights” panel (right or below)
- Top exception types (count)
- Most failing events (count)

---

## Screen 2 — Event Details (Select event + aggregation + tabs)

### Header
- Title: **Event Details**
- Controls:
  - Day selector (same as Home)
  - Event selector (searchable dropdown)
  - Updated Xs ago + Refresh

### KPI row (scoped to selected event + day)
Cards:
- Total Events
- Success
- Failures
- Success Rate %
- Retriable Failures
- Avg Latency (success only)
- (optional) P95 Latency

### Optional mini trend
- Success vs Failures by hour for selected event

### Tabs
- **Success**
- **Failures**

Default tab rule:
- If Failures > 0 → open **Failures**
- Else → open **Success**

### Tab toolbars (filters)
Common:
- Search input: traceId OR messageKey
Success tab optional filters:
- target_topic
- latency range
Failures tab optional filters:
- exception_type
- retriable (yes/no)
- retry_attempt range

---

## Success Tab — Table spec
Columns:
- Received Time
- Trace ID (clickable)
- Account Number
- Customer Type (optional)
- Source (topic/partition/offset)
- Target (topic/partition/offset)
- Sent Time
- Latency
- Message Key

Row actions:
- View Payloads (icon)
- Copy Trace ID (icon)

---

## Failures Tab — Table spec
Columns:
- Received Time
- Trace ID (clickable)
- Account Number
- Source (topic/partition/offset)
- Exception Type
- Exception Message (truncate + tooltip)
- Retriable (Y/N)
- Retry Attempt
- Message Key

Row actions:
- View Stack Trace (icon)
- View Payloads (icon)
- Copy Trace ID (icon)

---

## Row Details Drawer (right slide-over)

### Success drawer
- Header: Trace ID, Received time
- Metadata:
  - Account, Customer Type
  - Source topic/partition/offset
  - Target topic/partition/offset
  - Sent time, Latency
- Payload viewers:
  - Source payload (Pretty/Raw toggle)
  - Transformed payload (Pretty/Raw toggle)

### Failure drawer
- Header: Trace ID, Received time
- Exception:
  - Type, Message
  - Stack trace (monospace, copy)
- Retry:
  - retriable, retry_attempt
- Metadata:
  - Source topic/partition/offset
- Payload viewers:
  - Source payload (Pretty/Raw toggle)
  - Transformed payload (Pretty/Raw toggle)

---

## States
- Loading: skeleton KPI cards + skeleton rows
- Empty day: “No events found for selected day”
- Empty tab:
  - Success: “No success records”
  - Failures: “No failure records”
- Error banner: message + Retry

---

## UX rules
- Keep Home focused on **overview + drill-down** (no raw rows here).
- Event Details is the operational view (rows + drawer).
- Always preserve Day when navigating.
