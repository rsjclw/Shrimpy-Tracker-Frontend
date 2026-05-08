"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type BlindFeedingTemplate, type Farm, type FarmMember, type FarmRole, type FeedAdditive, type FeedType, type Grid, type Pond, type RegisteredUser } from "@/lib/api";
import { AdditivesSection } from "@/components/farm/AdditivesSection";
import { BlindFeedingSection } from "@/components/farm/BlindFeedingSection";
import { FeedTypesSection } from "@/components/farm/FeedTypesSection";
import { GridsSection } from "@/components/farm/GridsSection";
import { MembersSection } from "@/components/farm/MembersSection";
import { RegisteredUsersSection } from "@/components/farm/RegisteredUsersSection";
import { getSupabase } from "@/lib/supabase";

const sectionStorageKey = "farm-page-open-sections";
const defaultOpenSections = {
  members: false,
  grids: true,
  feedTypes: false,
  additives: false,
  blindFeeding: false,
  registeredUsers: false,
};

type FarmSection = keyof typeof defaultOpenSections;

export default function Home() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [farmMembers, setFarmMembers] = useState<FarmMember[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [registeredUsersError, setRegisteredUsersError] = useState<string | null>(null);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [additives, setAdditives] = useState<FeedAdditive[]>([]);
  const [blindFeedingTemplates, setBlindFeedingTemplates] = useState<BlindFeedingTemplate[]>([]);
  const [showNewFarm, setShowNewFarm] = useState(false);
  const [newFarmName, setNewFarmName] = useState("");
  const [editingFarm, setEditingFarm] = useState(false);
  const [farmEditName, setFarmEditName] = useState("");
  const [openSections, setOpenSections] = useState(defaultOpenSections);
  const [openSectionsLoaded, setOpenSectionsLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(sectionStorageKey);
    if (saved) {
      try {
        setOpenSections({ ...defaultOpenSections, ...JSON.parse(saved) });
      } catch {
        setOpenSections(defaultOpenSections);
      }
    }
    setOpenSectionsLoaded(true);
  }, []);

  useEffect(() => {
    if (!openSectionsLoaded) return;
    window.localStorage.setItem(sectionStorageKey, JSON.stringify(openSections));
  }, [openSections, openSectionsLoaded]);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      loadFarms();
    });
  }, [router]);

  async function loadFarms() {
    const visibleFarms = await api.listFarms();
    setFarms(visibleFarms);
    setSelectedFarmId((current) =>
      visibleFarms.some((farm) => farm.id === current) ? current : visibleFarms[0]?.id || "",
    );
    setAuthChecked(true);
  }

  useEffect(() => {
    if (authChecked && selectedFarmId) reload();
  }, [authChecked, selectedFarmId]);

  async function reload() {
    if (!selectedFarmId) return;
    const selected = farms.find((farm) => farm.id === selectedFarmId);
    const [g, p, ft, a, blindTemplates, members, usersResult] = await Promise.all([
      api.listGrids(selectedFarmId),
      api.listPonds(undefined, selectedFarmId),
      api.listFeedTypes(selectedFarmId),
      api.listAdditives(selectedFarmId),
      api.listBlindFeedingTemplates(selectedFarmId),
      selected?.role === "admin" ? api.listFarmMembers(selectedFarmId) : Promise.resolve([]),
      selected?.role === "admin"
        ? api.listRegisteredUsers()
            .then((users) => ({ users, error: null as string | null }))
            .catch((error) => ({ users: [] as RegisteredUser[], error: error.message }))
        : Promise.resolve({ users: [] as RegisteredUser[], error: null as string | null }),
    ]);
    setGrids(g);
    setPonds(p);
    setFeedTypes(ft);
    setAdditives(a);
    setBlindFeedingTemplates(blindTemplates);
    setFarmMembers(members);
    setRegisteredUsers(usersResult.users);
    setRegisteredUsersError(usersResult.error);
  }

  async function createFarm(e: React.FormEvent) {
    e.preventDefault();
    if (!newFarmName.trim()) return;
    const farm = await api.createFarm({ name: newFarmName.trim() });
    setNewFarmName("");
    setShowNewFarm(false);
    setSelectedFarmId(farm.id);
    loadFarms();
  }

  async function saveFarmName(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFarmId || !farmEditName.trim()) return;
    await api.updateFarm(selectedFarmId, { name: farmEditName.trim() });
    setEditingFarm(false);
    loadFarms();
  }

  async function deleteSelectedFarm(name: string) {
    if (!selectedFarmId) return;
    if (!confirm(`Delete farm "${name}" and all of its data? This cannot be undone.`)) return;
    await api.deleteFarm(selectedFarmId);
    setSelectedFarmId("");
    loadFarms();
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }

  function toggleSection(section: FarmSection) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  if (!authChecked) return <main className="p-6">Loading...</main>;

  const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) ?? null;
  const role: FarmRole | null = selectedFarm?.role ?? null;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{selectedFarm?.name ?? "Farm"}</h1>
          {selectedFarm && <div className="text-xs text-slate-500">{selectedFarm.role}</div>}
        </div>
        <button onClick={signOut} className="text-sm text-slate-600 hover:underline">
          Sign out
        </button>
      </header>

      {role === "admin" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowNewFarm((v) => !v)}
            className="text-sm bg-primary text-white px-3 py-1 rounded"
          >
            + New farm
          </button>
          {selectedFarm && (
            <>
              <button
                onClick={() => { setEditingFarm(true); setFarmEditName(selectedFarm.name); }}
                className="text-sm border px-3 py-1 rounded"
              >
                Rename farm
              </button>
              <button
                onClick={() => deleteSelectedFarm(selectedFarm.name)}
                className="text-sm border border-red-200 text-red-600 px-3 py-1 rounded"
              >
                Delete farm
              </button>
            </>
          )}
        </div>
      )}

      {showNewFarm && (
        <form onSubmit={createFarm} className="flex gap-2">
          <input
            autoFocus
            value={newFarmName}
            onChange={(e) => setNewFarmName(e.target.value)}
            placeholder="Farm name"
            className="flex-1 border rounded px-3 py-2"
          />
          <button className="bg-primary text-white px-4 rounded">Add</button>
          <button type="button" onClick={() => setShowNewFarm(false)} className="border px-3 rounded">Cancel</button>
        </form>
      )}

      {editingFarm && (
        <form onSubmit={saveFarmName} className="flex gap-2">
          <input
            autoFocus
            value={farmEditName}
            onChange={(e) => setFarmEditName(e.target.value)}
            placeholder="Farm name"
            className="flex-1 border rounded px-3 py-2"
          />
          <button className="bg-primary text-white px-4 rounded">Save</button>
          <button type="button" onClick={() => setEditingFarm(false)} className="border px-3 rounded">Cancel</button>
        </form>
      )}

      {farms.length === 0 ? (
        <section className="bg-white rounded-lg shadow p-4 text-sm text-slate-600">
          No farm access is registered for this account.
        </section>
      ) : farms.length > 1 ? (
        <label className="block text-sm">
          Farm
          <select
            value={selectedFarmId}
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name} ({farm.role})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedFarm && (
        <>
          {role === "admin" && (
            <MembersSection
              farmId={selectedFarmId}
              members={farmMembers}
              open={openSections.members}
              onToggle={() => toggleSection("members")}
              onReload={reload}
            />
          )}

          <GridsSection
            farmId={selectedFarmId}
            grids={grids}
            ponds={ponds}
            role={role}
            open={openSections.grids}
            onToggle={() => toggleSection("grids")}
            onReload={reload}
          />

          <FeedTypesSection
            farmId={selectedFarmId}
            feedTypes={feedTypes}
            role={role}
            open={openSections.feedTypes}
            onToggle={() => toggleSection("feedTypes")}
            onReload={reload}
          />

          <AdditivesSection
            farmId={selectedFarmId}
            additives={additives}
            role={role}
            open={openSections.additives}
            onToggle={() => toggleSection("additives")}
            onReload={reload}
          />

          <BlindFeedingSection
            farmId={selectedFarmId}
            templates={blindFeedingTemplates}
            role={role}
            open={openSections.blindFeeding}
            onToggle={() => toggleSection("blindFeeding")}
            onReload={reload}
          />

          {role === "admin" && (
            <RegisteredUsersSection
              farmId={selectedFarmId}
              members={farmMembers}
              users={registeredUsers}
              error={registeredUsersError}
              open={openSections.registeredUsers}
              onToggle={() => toggleSection("registeredUsers")}
            />
          )}
        </>
      )}
    </main>
  );
}
