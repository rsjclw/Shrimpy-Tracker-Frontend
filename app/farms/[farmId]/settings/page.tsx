"use client";

import { useCallback, useEffect, useState } from "react";
import { AdditivesSection } from "@/components/farm-settings/AdditivesSection";
import { BlindFeedingSection } from "@/components/farm-settings/BlindFeedingSection";
import { FeedTypesSection } from "@/components/farm-settings/FeedTypesSection";
import { GridsSection } from "@/components/farm-settings/GridsSection";
import { Banner, Loading } from "@/components/ui/Field";
import { PageColumn, PageHeader } from "@/components/ui/PageHeader";
import { api, type BlindFeedingTemplate, type Farm, type FeedAdditive, type FeedType, type Grid, type Pond } from "@/lib/api";
import { canManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

type SectionKey = "feeds" | "additives" | "programs" | "grids";

export default function FarmSettingsPage({ params }: { params: { farmId: string } }) {
  const { farmId } = params;
  const user = useRequireUser();

  const [farm, setFarm] = useState<Farm | null>(null);
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [additives, setAdditives] = useState<FeedAdditive[]>([]);
  const [templates, setTemplates] = useState<BlindFeedingTemplate[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Every section starts collapsed, same as the mockup.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    feeds: false,
    additives: false,
    programs: false,
    grids: false,
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [f, ft, ad, bf, gr, pd] = await Promise.all([
        api.getFarm(farmId),
        api.listFeedTypes(farmId),
        api.listAdditives(farmId),
        api.listBlindFeedingTemplates(farmId),
        api.listGrids(farmId),
        api.listPonds(undefined, farmId),
      ]);
      setFarm(f);
      setFeedTypes(ft);
      setAdditives(ad);
      setTemplates(bf);
      setGrids(gr);
      setPonds(pd);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load farm settings.");
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user, loadAll]);

  const reloadFeedTypes = useCallback(async () => setFeedTypes(await api.listFeedTypes(farmId)), [farmId]);
  const reloadAdditives = useCallback(async () => setAdditives(await api.listAdditives(farmId)), [farmId]);
  const reloadTemplates = useCallback(async () => setTemplates(await api.listBlindFeedingTemplates(farmId)), [farmId]);
  const reloadGrids = useCallback(async () => {
    const [gr, pd] = await Promise.all([api.listGrids(farmId), api.listPonds(undefined, farmId)]);
    setGrids(gr);
    setPonds(pd);
  }, [farmId]);

  function toggle(key: SectionKey) {
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  if (!user) return <Loading />;

  const manage = canManage(farm?.role);

  return (
    <PageColumn className="gap-[26px]">
      <PageHeader eyebrow={farm?.name ?? "Farm"} title="Farm settings" backHref={`/?farm=${farmId}`} />

      {loading ? (
        <Loading />
      ) : loadError ? (
        <Banner tone="bad">{loadError}</Banner>
      ) : !farm ? (
        <Banner tone="bad">Farm not found.</Banner>
      ) : !manage ? (
        <Banner tone="warn">Only maintainers can open farm settings.</Banner>
      ) : (
        <>
          <FeedTypesSection
            farmId={farmId}
            feedTypes={feedTypes}
            canManage={manage}
            open={open.feeds}
            onToggle={() => toggle("feeds")}
            onReload={reloadFeedTypes}
          />
          <AdditivesSection
            farmId={farmId}
            additives={additives}
            canManage={manage}
            open={open.additives}
            onToggle={() => toggle("additives")}
            onReload={reloadAdditives}
          />
          <BlindFeedingSection
            farmId={farmId}
            templates={templates}
            canManage={manage}
            open={open.programs}
            onToggle={() => toggle("programs")}
            onReload={reloadTemplates}
          />
          <GridsSection
            farmId={farmId}
            grids={grids}
            ponds={ponds}
            canManage={manage}
            open={open.grids}
            onToggle={() => toggle("grids")}
            onReload={reloadGrids}
          />
        </>
      )}
    </PageColumn>
  );
}
