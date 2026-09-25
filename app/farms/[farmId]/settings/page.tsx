"use client";

import { useCallback, useEffect, useState } from "react";
import { BlindFeedingSection } from "@/components/farm-settings/BlindFeedingSection";
import { GridsSection } from "@/components/farm-settings/GridsSection";
import { FormulasSection } from "@/components/farm-settings/FormulasSection";
import { Banner, Loading } from "@/components/ui/Field";
import { PageColumn, PageHeader } from "@/components/ui/PageHeader";
import { api, type BlindFeedingTemplate, type Farm, type Grid, type Pond, type Product } from "@/lib/api";
import { canManage } from "@/lib/roles";
import { useRequireUser } from "@/lib/session";

type SectionKey = "formulas" | "programs" | "grids";

export default function FarmSettingsPage({ params }: { params: { farmId: string } }) {
  const { farmId } = params;
  const user = useRequireUser();

  const [farm, setFarm] = useState<Farm | null>(null);
  // Formulas are what a worker applies; products are the goods they draw on.
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<BlindFeedingTemplate[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Every section starts collapsed, same as the mockup.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    formulas: false,
    programs: false,
    grids: false,
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [f, pr, it, bf, gr, pd] = await Promise.all([
        api.getFarm(farmId),
        api.listProducts(farmId, "formula").catch(() => [] as Product[]),
        api.listProducts(farmId, "product").catch(() => [] as Product[]),
        api.listBlindFeedingTemplates(farmId),
        api.listGrids(farmId),
        api.listPonds(undefined, farmId),
      ]);
      setFarm(f);
      setProducts(pr);
      setItems(it);
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

  /**
   * Both halves of the catalog, because they share one name list: a product
   * renamed on the inventory page has to be seen here or the name check blocks
   * a formula over a name nobody is using any more.
   */
  const reloadCatalog = useCallback(async () => {
    const [formulas, stocked] = await Promise.all([
      api.listProducts(farmId, "formula"),
      api.listProducts(farmId, "product"),
    ]);
    setProducts(formulas);
    setItems(stocked);
  }, [farmId]);

  // Opening the section refetches: the inventory page may have renamed something.
  useEffect(() => {
    if (open.formulas) reloadCatalog().catch(() => undefined);
  }, [open.formulas, reloadCatalog]);
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
          <FormulasSection
            farmId={farmId}
            products={products}
            items={items}
            canManage={manage}
            open={open.formulas}
            onToggle={() => toggle("formulas")}
            onReload={reloadCatalog}
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
