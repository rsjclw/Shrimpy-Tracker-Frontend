"use client";

import { addDays, format, parseISO } from "date-fns";
import { useEffect, useState } from "react";

type Props = {
  date: string; // yyyy-MM-dd
  onChange: (next: string) => void;
  doc: number;
  startDate: string;
  onPredict?: () => void;
};

function classify(date: string): { label: string; classes: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  if (date === today) return { label: "TODAY", classes: "bg-emerald-100 text-emerald-800" };
  if (date < today) return { label: "PAST", classes: "bg-slate-100 text-slate-700" };
  return { label: "FUTURE", classes: "bg-amber-100 text-amber-800" };
}

export function DateNavigator({ date, onChange, doc, startDate, onPredict }: Props) {
  const { label, classes } = classify(date);
  const isPast = date < format(new Date(), "yyyy-MM-dd");
  const [docDraft, setDocDraft] = useState(String(doc));
  const shift = (days: number) => onChange(format(addDays(parseISO(date), days), "yyyy-MM-dd"));

  useEffect(() => {
    setDocDraft(String(doc));
  }, [doc]);

  function jumpToDoc(e: React.FormEvent) {
    e.preventDefault();
    const nextDoc = Number(docDraft);
    if (!Number.isFinite(nextDoc) || nextDoc < 1) return;
    onChange(format(addDays(parseISO(startDate), Math.floor(nextDoc) - 1), "yyyy-MM-dd"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-lg shadow p-3">
      <button
        type="button"
        onClick={() => shift(-1)}
        className="px-2 py-1 rounded hover:bg-slate-100"
        aria-label="previous day"
      >
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1"
      />
      <button
        type="button"
        onClick={() => shift(1)}
        className="px-2 py-1 rounded hover:bg-slate-100"
        aria-label="next day"
      >
        →
      </button>
      <form onSubmit={jumpToDoc} className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-sm text-slate-500">
          DOC
          <input
            type="number"
            min="1"
            step="1"
            value={docDraft}
            onChange={(e) => setDocDraft(e.target.value)}
            className="w-20 border rounded px-2 py-1 text-slate-900"
          />
        </label>
        <button type="submit" className="text-sm border px-3 py-1 rounded hover:bg-slate-50">
          Go
        </button>
      </form>
      <div className="ml-auto flex items-center gap-2">
        {onPredict && !isPast && (
          <button
            type="button"
            onClick={onPredict}
            className="text-sm bg-amber-500 text-white px-3 py-1 rounded hover:bg-amber-600"
          >
            Predict
          </button>
        )}
        <span className={`text-xs font-semibold px-2 py-1 rounded ${classes}`}>{label}</span>
      </div>
    </div>
  );
}
