import { useState } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  periodLabel,
  usePeriodMutations,
  type AccountingPeriodRow,
  type FinanceSettings,
} from "@/lib/finance";

export function PeriodsPanel({
  periods,
  settings,
  onSaveSettings,
  savingSettings,
}: {
  periods: AccountingPeriodRow[];
  settings: FinanceSettings;
  onSaveSettings: (next: FinanceSettings) => Promise<void> | void;
  savingSettings: boolean;
}) {
  const { upsert } = usePeriodMutations();
  const [newPeriod, setNewPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = useState<FinanceSettings>(settings);

  async function toggle(row: AccountingPeriodRow) {
    try {
      await upsert.mutateAsync({
        period: row.period,
        status: row.status === "closed" ? "open" : "closed",
      });
      toast.success(
        row.status === "closed"
          ? `${periodLabel(row.period)} reopened.`
          : `${periodLabel(row.period)} closed — no further postings allowed.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that period.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Accounting periods</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Close a month once it's reconciled and reported. Closed periods reject every new
            posting, manual or automatic.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-period">Add period</Label>
              <Input
                id="new-period"
                type="month"
                value={newPeriod}
                onChange={(event) => setNewPeriod(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() =>
                void upsert
                  .mutateAsync({ period: newPeriod, status: "open" })
                  .then(() => toast.success(`${periodLabel(newPeriod)} opened.`))
              }
            >
              Open period
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{periodLabel(row.period)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "closed" ? "secondary" : "default"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => void toggle(row)}>
                        {row.status === "closed" ? (
                          <LockOpen className="size-4" />
                        ) : (
                          <Lock className="size-4" />
                        )}
                        {row.status === "closed" ? "Reopen" : "Close"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {periods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No periods yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Finance settings</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Statutory rates and the business identity printed on statements.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fin-legal">Registered name</Label>
              <Input
                id="fin-legal"
                value={draft.legalName}
                onChange={(event) => setDraft({ ...draft, legalName: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin-tin">Tax identification number</Label>
              <Input
                id="fin-tin"
                value={draft.taxNumber}
                onChange={(event) => setDraft({ ...draft, taxNumber: event.target.value })}
                placeholder="GRA TIN"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin-vat">VAT rate (%)</Label>
              <Input
                id="fin-vat"
                type="number"
                min={0}
                step="0.5"
                value={draft.vatRate}
                onChange={(event) => setDraft({ ...draft, vatRate: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin-levy">Levies NHIL/GETFund/COVID (%)</Label>
              <Input
                id="fin-levy"
                type="number"
                min={0}
                step="0.5"
                value={draft.levyRate}
                onChange={(event) => setDraft({ ...draft, levyRate: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin-wht">Withholding on payouts (%)</Label>
              <Input
                id="fin-wht"
                type="number"
                min={0}
                step="0.5"
                value={draft.withholdingRate}
                onChange={(event) =>
                  setDraft({ ...draft, withholdingRate: Number(event.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin-fy">Financial year starts (month)</Label>
              <Input
                id="fin-fy"
                type="number"
                min={1}
                max={12}
                value={draft.fiscalYearStartMonth}
                onChange={(event) =>
                  setDraft({ ...draft, fiscalYearStartMonth: Number(event.target.value) })
                }
              />
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">
              Defer membership revenue over the subscription period
              <span className="block text-xs text-muted-foreground">
                Recognises room fees monthly instead of on payment day.
              </span>
            </span>
            <Switch
              checked={draft.deferMembershipRevenue}
              onCheckedChange={(checked) => setDraft({ ...draft, deferMembershipRevenue: checked })}
            />
          </label>

          <Button
            onClick={() =>
              void Promise.resolve(onSaveSettings(draft)).then(() =>
                toast.success("Finance settings saved."),
              )
            }
            disabled={savingSettings}
          >
            {savingSettings ? <Loader2 className="size-4 animate-spin" /> : null}
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
