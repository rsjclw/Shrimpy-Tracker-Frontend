"use client";

import { Segmented } from "@/components/ui/Section";
import type { Lang } from "./copy";

/** EN/ID segmented toggle, top-right on both auth screens. */
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <Segmented
      label="Language"
      size="sm"
      value={lang}
      onChange={onChange}
      options={[
        { value: "en", label: "EN" },
        { value: "id", label: "ID" },
      ]}
    />
  );
}
