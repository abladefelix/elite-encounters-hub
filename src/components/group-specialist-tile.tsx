import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStoredMedia } from "@/lib/queries";
import { initials } from "@/lib/types";

export interface GroupSpecialistTileData {
  id: string;
  name: string;
  cover_url: string | null;
  specialist_group_members: Array<{
    id: string;
    is_lead: boolean;
    profiles: { display_name: string; avatar_url: string | null } | null;
  }>;
}

export function GroupSpecialistTile({ group, onSelect }: { group: GroupSpecialistTileData; onSelect: () => void }) {
  const lead = group.specialist_group_members.find((member) => member.is_lead)?.profiles;
  const imagePath = group.cover_url || lead?.avatar_url;
  const { data: media } = useStoredMedia(imagePath ? [{ bucket: "avatars" as const, value: imagePath }] : []);
  const imageUrl = imagePath ? media?.[imagePath] : undefined;

  return <Button variant="ghost" className="group h-auto w-full flex-col items-stretch overflow-hidden border border-border/70 bg-surface-strong p-0 text-left hover:bg-surface-strong" onClick={onSelect}>
    <div className="relative aspect-[4/5] w-full overflow-hidden">
      {imageUrl ? <img src={imageUrl} alt={`${group.name}, Ash group`} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" /> : <div className="flex size-full items-center justify-center bg-panel font-display text-2xl text-muted-foreground">{initials(group.name)}</div>}
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold shadow-sm"><Users className="size-3" /> Team of {group.specialist_group_members.length}</span>
    </div>
    <div className="w-full px-2 py-2"><p className="truncate text-xs font-semibold">{group.name}</p><p className="truncate text-[10px] font-normal text-muted-foreground">Led by {lead?.display_name ?? "Ashnight specialist"}</p></div>
  </Button>;
}