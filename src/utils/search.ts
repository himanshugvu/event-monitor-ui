import type { EventCatalogItem } from "../types";

export const resolveSearch = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { traceId: undefined, messageKey: undefined };
  }
  return { traceId: trimmed, messageKey: undefined };
};

export const resolveCatalogEntry = (eventKey: string, catalog: EventCatalogItem[]) => {
  const entry = catalog.find((item) => item.eventKey === eventKey);
  if (entry) {
    return entry;
  }
  return {
    eventKey,
    name: eventKey || "Event Details",
    category: "Uncategorized",
  };
};
