/**
 * Admin-owned catalogue of ash services.
 *
 * Backed by the real `public.services` table via TanStack Query. The admin
 * dashboard is the only place services are created; specialists pick from
 * this list at registration and on their profile page. Row-level security
 * restricts writes to admins, so mutation failures surface as toasts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import type { ServiceRow } from "@/lib/queries";
import { useServiceMutations, useServices } from "@/lib/queries";

export interface ServiceItem {
  /** Real `services.id` UUID. */
  id: string;
  label: string;
  description: string;
  category: string;
  /** Suggested hourly rate in GHS. */
  suggestedRate: number;
  active: boolean;
  sortOrder: number;
  /** Kept for API compatibility; the services table has no dedicated
   * "selectable at registration" flag, so this mirrors `active`. */
  specialistSelectable: boolean;
}

function fromRow(row: ServiceRow): ServiceItem {
  return {
    id: row.id,
    label: row.name,
    description: row.description,
    category: row.category,
    suggestedRate: row.base_rate,
    active: row.active,
    sortOrder: row.sort_order,
    specialistSelectable: row.active,
  };
}

/** Retained for callers that still want a slug (e.g. suggested categories);
 * no longer used as a database id. */
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
  isLoading: boolean;
  addService: (input: Omit<ServiceItem, "id" | "sortOrder">) => void;
  updateService: (id: string, patch: Partial<Omit<ServiceItem, "id">>) => void;
  removeService: (id: string) => void;
  labelOf: (id: string) => string;
}

const ServiceCatalogContext = createContext<ServiceCatalogContextValue | null>(null);

export function ServiceCatalogProvider({ children }: { children: ReactNode }) {
  const { data: rows, isLoading } = useServices(true);
  const { create, update, remove } = useServiceMutations();

  const services = useMemo(() => (rows ?? []).map(fromRow), [rows]);

  const addService = useCallback<ServiceCatalogContextValue["addService"]>(
    (input) => {
      const nextSort = services.length
        ? Math.max(...services.map((item) => item.sortOrder)) + 1
        : 0;
      create.mutate(
        {
          name: input.label,
          description: input.description,
          category: input.category,
          base_rate: input.suggestedRate,
          active: input.active,
          sort_order: nextSort,
        },
        {
          onError: (error) => toast.error(`Could not add service: ${error.message}`),
        },
      );
    },
    [create, services],
  );

  const updateService = useCallback<ServiceCatalogContextValue["updateService"]>(
    (id, patch) => {
      update.mutate(
        {
          id,
          patch: {
            ...(patch.label !== undefined ? { name: patch.label } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.category !== undefined ? { category: patch.category } : {}),
            ...(patch.suggestedRate !== undefined ? { base_rate: patch.suggestedRate } : {}),
            ...(patch.active !== undefined ? { active: patch.active } : {}),
            ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
          },
        },
        {
          onError: (error) => toast.error(`Could not update service: ${error.message}`),
        },
      );
    },
    [update],
  );

  const removeService = useCallback<ServiceCatalogContextValue["removeService"]>(
    (id) => {
      remove.mutate(id, {
        onError: (error) => toast.error(`Could not remove service: ${error.message}`),
      });
    },
    [remove],
  );

  const labelOf = useCallback(
    (id: string) => services.find((item) => item.id === id)?.label ?? id,
    [services],
  );

  const value = useMemo<ServiceCatalogContextValue>(() => {
    const activeServices = services.filter((item) => item.active);
    return {
      services,
      activeServices,
      selectableServices: activeServices.filter((item) => item.specialistSelectable),
      isLoading,
      addService,
      updateService,
      removeService,
      labelOf,
    };
  }, [services, isLoading, addService, updateService, removeService, labelOf]);

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

// `supabase` re-exported use kept implicit via useServices/useServiceMutations above.
