"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CycleSection } from "@/components/pond-settings/CycleSection";
import { FeedingProgramSection } from "@/components/pond-settings/FeedingProgramSection";
import { GeneralSection } from "@/components/pond-settings/GeneralSection";
import { HarvestSection } from "@/components/pond-settings/HarvestSection";
import { SaveBar } from "@/components/pond-settings/SaveBar";
import { TargetsSection } from "@/components/pond-settings/TargetsSection";
import {
  buildPredictionConfig,
  cycleDraftFromCycle,
  cycleEqual,
  cycleErrors,
  type CycleDraft,
  generalEqual,
  generalErrors,
  generalFromPond,
  type GeneralDraft,
  num,
} from "@/components/pond-settings/types";
import { Button } from "@/components/ui/Button";
import { Banner, ConfirmStrip, Loading } from "@/components/ui/Field";
import { PageColumn, PageHeader } from "@/components/ui/PageHeader";
import { api, type BlindFeedingTemplate, type Cycle, type Farm, type Grid, type Pond, type Product } from "@/lib/api";
import { currentCycle, cycleLabel } from "@/lib/cycles";
import { isoForDoc } from "@/lib/dates";
import { canManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

type OpenSections = { general: boolean; cycle: boolean; targets: boolean; feeding: boolean; harvest: boolean };
const DEFAULT_OPEN: OpenSections = { general: false, cycle: false, targets: false, feeding: false, harvest: false };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function PondSettingsPage() {
  const user = useRequireUser();
  const { pondId } = useParams<{ pondId: string }>();
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pond, setPond] = useState<Pond | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  // Feeds are catalog entries now: anything in the feed category, priced or not.
  const [feedTypes, setFeedTypes] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<BlindFeedingTemplate[]>([]);

  const [savedGeneral, setSavedGeneral] = useState<GeneralDraft>({ name: "", area: "", firstFeed: "06:00" });
  const [draftGeneral, setDraftGeneral] = useState<GeneralDraft>({ name: "", area: "", firstFeed: "06:00" });
  const [savedCycleDraft, setSavedCycleDraft] = useState<CycleDraft | null>(null);
  const [draftCycle, setDraftCycle] = useState<CycleDraft | null>(null);
  const [usedDefaults, setUsedDefaults] = useState(false);

  const [open, setOpen] = useState<OpenSections>(DEFAULT_OPEN);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [currentPond, pondCycles] = await Promise.all([api.getPond(pondId), api.listPondCycles(pondId)]);
    const grids = await api.listGrids();
    const currentGrid = grids.find((g) => g.id === currentPond.grid_id) ?? null;
    const currentFarm = currentGrid ? await api.getFarm(currentGrid.farm_id) : null;
    const [ft, tpl] = currentFarm
      ? await Promise.all([
          api.listProducts(currentFarm.id).then((all) => all.filter((p) => p.category === "feed")),
          api.listBlindFeedingTemplates(currentFarm.id),
        ])
      : [[], []];

    setPond(currentPond);
    setGrid(currentGrid);
    setFarm(currentFarm);
    setCycles(pondCycles);
    setFeedTypes(ft);
    setTemplates(tpl);

    const gen = generalFromPond(currentPond);
    setSavedGeneral(gen);
    setDraftGeneral(gen);

    const active = currentCycle(pondCycles, currentPond.id);
    if (active) {
      const { draft, usedDefaults: defaults } = cycleDraftFromCycle(active);
      setSavedCycleDraft(draft);
      setDraftCycle(draft);
      setUsedDefaults(defaults);
    } else {
      setSavedCycleDraft(null);
      setDraftCycle(null);
      setUsedDefaults(false);
    }
  }, [pondId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  if (!user) return <Loading />;
  if (!loaded) {
    return (
      <PageColumn>
        <Loading />
      </PageColumn>
    );
  }
  if (loadError || !pond) {
    return (
      <PageColumn>
        <Banner tone="bad">{loadError ?? "Pond not found"}</Banner>
      </PageColumn>
    );
  }

  const role = farm?.role ?? null;
  const readOnly = !canManage(role);
  if (readOnly) {
    return (
      <PageColumn>
        <PageHeader eyebrow={`${farm?.name ?? "—"} · ${pond.name}`} title="Pond settings" backHref={farm ? `/?farm=${farm.id}` : "/"} />
        <Banner tone="warn">Only maintainers can open pond settings.</Banner>
      </PageColumn>
    );
  }
  const activeCycle = currentCycle(cycles, pond.id);

  const generalDirty = !generalEqual(draftGeneral, savedGeneral);
  const cycleDirty = !!(activeCycle && draftCycle && savedCycleDraft && !cycleEqual(draftCycle, savedCycleDraft));
  const dirty = generalDirty || cycleDirty;

  // Prediction settings only need to be complete when they are what changed; renaming the cycle or
  // setting its target DOC on a cycle without settings saves just those fields.
  const configDirty = !!(
    cycleDirty &&
    draftCycle &&
    savedCycleDraft &&
    (activeCycle?.prediction_config || !cycleEqual({ ...draftCycle, name: savedCycleDraft.name, finalDoc: savedCycleDraft.finalDoc }, savedCycleDraft))
  );
  const errors = [
    ...(generalDirty ? generalErrors(draftGeneral) : []),
    ...(cycleDirty && draftCycle
      ? cycleErrors(draftCycle).filter((e) => configDirty || /name|DOC/i.test(e))
      : []),
  ];
  const hint = errors.length ? errors[0] : `Applies to ${pond.name}${activeCycle ? ` · ${cycleLabel(activeCycle)}` : ""}`;

  function toggle(key: keyof OpenSections) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (generalDirty) {
        await api.updatePond(pond!.id, {
          name: draftGeneral.name.trim(),
          area_m2: num(draftGeneral.area),
          default_feed_time: `${draftGeneral.firstFeed}:00`,
        });
      }
      if (cycleDirty && activeCycle && draftCycle) {
        const cfg = buildPredictionConfig(draftCycle);
        await api.updateCycle(activeCycle.id, {
          name: draftCycle.name.trim(),
          ...(draftCycle.finalDoc.trim()
            ? { planned_end_date: isoForDoc(activeCycle.start_date, Math.trunc(num(draftCycle.finalDoc))) }
            : {}),
          ...(configDirty
            ? {
                maximum_feeding_index: cfg.growth.maximum_feeding_index,
                feeding_index_increment: cfg.growth.feeding_index_increment,
                prediction_config: cfg,
              }
            : {}),
        });
      }
      await reload();
    } catch (err) {
      setSaveError(errorText(err));
      try {
        await reload();
      } catch {
        // best effort; keep the error visible either way
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraftGeneral(savedGeneral);
    if (savedCycleDraft) setDraftCycle(savedCycleDraft);
    setSaveError(null);
  }

  async function handleDelete() {
    if (!pond || !grid || !farm) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deletePond(pond.id);
      router.replace(`/?farm=${farm.id}&grid=${grid.id}`);
    } catch (err) {
      setDeleteError(errorText(err));
      setDeleteBusy(false);
    }
  }

  const activeTemplate = activeCycle?.blind_feeding_template_id
    ? templates.find((t) => t.id === activeCycle.blind_feeding_template_id) ?? null
    : null;

  return (
    <PageColumn className="gap-3.5">
      <PageHeader
        eyebrow={`${farm?.name ?? "—"} · ${pond.name}`}
        title="Pond settings"
        backHref={farm && grid ? `/?farm=${farm.id}&grid=${grid.id}&pond=${pond.id}` : "/"}
        right={
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.04em] ${
              activeCycle ? "border-accent text-accent" : "border-line text-tx-muted"
            }`}
          >
            {activeCycle ? `${cycleLabel(activeCycle)} · active` : "No active cycle"}
          </span>
        }
      />

      <GeneralSection
        draft={draftGeneral}
        gridName={grid?.name ?? "—"}
        open={open.general}
        onToggle={() => toggle("general")}
        onChange={setDraftGeneral}
        readOnly={readOnly}
      />

      <CycleSection
        pond={pond}
        cycle={activeCycle}
        cycles={cycles}
        draft={draftCycle}
        onChangeDraft={setDraftCycle}
        feedTypes={feedTypes}
        templates={templates}
        open={open.cycle}
        onToggle={() => toggle("cycle")}
        readOnly={readOnly}
        onReload={reload}
      />

      {activeCycle && draftCycle ? (
        <TargetsSection
          cycleName={cycleLabel(activeCycle)}
          draft={draftCycle}
          areaM2={num(draftGeneral.area)}
          open={open.targets}
          onToggle={() => toggle("targets")}
          onChange={setDraftCycle}
          readOnly={readOnly}
          usedDefaults={usedDefaults}
        />
      ) : null}

      {activeCycle && draftCycle && farm ? (
        <FeedingProgramSection
          farmId={farm.id}
          template={activeTemplate}
          feedTypes={feedTypes}
          feedPlan={draftCycle.feedPlan}
          onChangePlan={(feedPlan) => setDraftCycle({ ...draftCycle, feedPlan })}
          open={open.feeding}
          onToggle={() => toggle("feeding")}
          readOnly={readOnly}
        />
      ) : null}

      {activeCycle && draftCycle ? (
        <HarvestSection
          draft={draftCycle}
          open={open.harvest}
          onToggle={() => toggle("harvest")}
          onChange={setDraftCycle}
          readOnly={readOnly}
        />
      ) : null}

      {!readOnly ? (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-bad">Danger zone</span>
          {deleteConfirm ? (
            <ConfirmStrip
              message={`Delete ${pond.name}? This removes its cycles and all of their daily logs, feedings, harvests, water readings and treatments.`}
              confirmLabel="Delete pond"
              busy={deleteBusy}
              onCancel={() => setDeleteConfirm(false)}
              onConfirm={handleDelete}
            />
          ) : (
            <Button variant="outline-danger" onClick={() => setDeleteConfirm(true)}>
              Delete pond
            </Button>
          )}
          {deleteError ? <Banner tone="bad">{deleteError}</Banner> : null}
        </div>
      ) : null}

      {saveError ? <Banner tone="bad">{saveError}</Banner> : null}

      {!readOnly && dirty ? (
        <SaveBar hint={hint} hasError={errors.length > 0} saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      ) : null}
    </PageColumn>
  );
}
