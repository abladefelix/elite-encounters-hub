/**
 * Admin-owned catalogue of ash services.
 *
 * The admin dashboard is the only place services are created; specialists pick
 * from this list at registration and on their profile page. Persisted in
 * localStorage so the mock data layer can be swapped for a real backend later.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ServiceItem {
  id: string;
  label: string;
  description: string;
  baseHours: number;
  /** Suggested hourly rate in GHS. */
  suggestedRate: number;
  active: boolean;
  /** Shown to specialists at registration when true. */
  specialistSelectable: boolean;
}

export const DEFAULT_SERVICES: ServiceItem[] = [
  {
    id: "standard",
    label: "Standard clean",
    description: "Routine surface clean of an occupied home or office.",
    baseHours: 2,
    suggestedRate: 60,
    active: true,
    specialistSelectable: true,
  },
  {
    id: "deep",
    label: "Deep clean",
    description: "Top-to-bottom detail clean including skirting, grout and appliances.",
    baseHours: 5,
    suggestedRate: 85,
    active: true,
    specialistSelectable: true,
  },
  {
    id: "move",
    label: "Move-in / move-out",
    description: "Empty-property clean handover ready for keys.",
    baseHours: 5,
    suggestedRate: 90,
    active: true,
    specialistSelectable: true,
  },
  {
    id: "reno",
    label: "Post-renovation clean",
    description: "Dust, debris and paint residue removal after building work.",
    baseHours: 6,
    suggestedRate: 110,
    active: true,
    specialistSelectable: true,
  },
  {
    id: "housekeeping",
    label: "Housekeeping visit",
    description: "Laundry, linens, dishes and tidying on a scheduled visit.",
    baseHours: 4,
    suggestedRate: 70,
    active: true,
    specialistSelectable: true,
  },
  {
    id: "recurring",
    label: "Recurring weekly upkeep",
    description: "Same specialist, same slot, every week.",
    baseHours: 3,
    suggestedRate: 65,
    active: true,
    specialistSelectable: true,
  },
];

export const SERVICE_CATALOG_STORAGE_KEY = "ashnight-service-catalog-v1";

function sanitize(value: unknown): ServiceItem[] {
  if (!Array.isArray(value)) return DEFAULT_SERVICES.map((item) => ({ ...item }));
  const items: ServiceItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record["id"] === "string" ? record["id"].trim() : "";
    const label = typeof record["label"] === "string" ? record["label"].trim() : "";
    if (!id || !label) continue;
    items.push({
      id,
      label: label.slice(0, 60),
      description:
        typeof record["description"] === "string" ? record["description"].slice(0, 240) : "",
      baseHours: clamp(record["baseHours"], 2, 1, 24),
      suggestedRate: clamp(record["suggestedRate"], 60, 0, 100000),
      active: record["active"] !== false,
      specialistSelectable: record["specialistSelectable"] !== false,
    });
  }
  return items.length ? items : DEFAULT_SERVICES.map((item) => ({ ...item }));
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function slugifyService(label: string) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `service-${Date.now().toString(36)}`;
}

interface ServiceCatalogContextValue {
  services: ServiceItem[];
  /** Active services only — what members and chat booking should ever see. */
  activeServices: ServiceItem[];
  /** Active + selectable services specialists may attach to their profile. */
  selectableServices: ServiceItem[];
  addService: (input: Omit<ServiceItem, "id">) => void;
  updateService: (id: string, patch: Partial<Omit<ServiceItem, "id">>) => void;
  removeService: (id: string) => void;
  resetServices: () => void;
  labelOf: (id: string) => string;
}

const ServiceCatalogContext = createContext<ServiceCatalogContextValue | null>(null);

export function ServiceCatalogProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<ServiceItem[]>(() =>
    DEFAULT_SERVICES.map((item) => ({ ...item })),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SERVICE_CATALOG_STORAGE_KEY);
      if (raw) setServices(sanitize(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== SERVICE_CATALOG_STORAGE_KEY) return;
      try {
        setServices(sanitize(event.newValue ? JSON.parse(event.newValue) : null));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ref = useRef(services);
  ref.current = services;

  const commit = useCallback((next: ServiceItem[]) => {
    setServices(next);
    try {
      window.localStorage.setItem(SERVICE_CATALOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const value = useMemo<ServiceCatalogContextValue>(() => {
    const activeServices = services.filter((item) => item.active);
    return {
      services,
      activeServices,
      selectableServices: activeServices.filter((item) => item.specialistSelectable),
      addService: (input) => {
        const existing = ref.current;
        let id = slugifyService(input.label);
        if (existing.some((item) => item.id === id)) id = `${id}-${existing.length + 1}`;
        commit([...existing, { ...input, id }]);
      },
      updateService: (id, patch) =>
        commit(ref.current.map((item) => (item.id === id ? { ...item, ...patch } : item))),
      removeService: (id) => commit(ref.current.filter((item) => item.id !== id)),
      resetServices: () => commit(DEFAULT_SERVICES.map((item) => ({ ...item }))),
      labelOf: (id) => services.find((item) => item.id === id)?.label ?? id,
    };
  }, [services, commit]);

  return (
    <ServiceCatalogContext.Provider value={value}>{children}</ServiceCatalogContext.Provider>
  );
}

export function useServiceCatalog() {
  const context = useContext(ServiceCatalogContext);
  if (!context) {
    throw new Error("useServiceCatalog must be used inside <ServiceCatalogProvider>");
  }
  return context;
}
