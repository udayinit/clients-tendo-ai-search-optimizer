"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AnalysisResult } from "@/lib/anthropic";

const TABS = ["Summary", "AI search benchmark", "Gap analysis", "Optimized content"];

const AI_DIMS = [
  { key: "entity_clarity", label: "Entity clarity" },
  { key: "fact_density", label: "Fact & stat density" },
  { key: "answer_structure", label: "Answer structure" },
  { key: "citation_worthiness", label: "Citation worthiness" },
  { key: "snippet_readiness", label: "Snippet readiness" },
];

function scoreColor(score: number) {
  return score >= 75 ? "#1D9E75" : score >= 50 ? "#EF9F27" : "#E24B4A";
}

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const cx = 44;
  const cy = 44;
  const stroke = 8;
  const circ = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${(score / 100) * circ} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="18" fontWeight="500" fill="#111827">
        {score}
      </text>
    </svg>
  );
}

function GapCard({ gap, i }: { gap: { issue: string; recommendation: string }; i: number }) {
  const bg = ["#fee2e2", "#fef3c7", "#dbeafe"];
  const tc = ["#b91c1c", "#92400e", "#1e40af"];
  const labels = ["High impact", "Medium impact", "Low impact"];
  const c = Math.min(i, 2);
  return (
    <div className="mb-2.5 rounded-lg border border-gray-200 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 flex-1 text-sm font-medium text-gray-900">{gap.issue}</p>
        <span
          className="whitespace-nowrap rounded px-2.5 py-0.5 text-[11px]"
          style={{ background: bg[c], color: tc[c] }}
        >
          {labels[c]}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">{gap.recommendation}</p>
    </div>
  );
}

// Renders a small, known markdown subset (headings, **bold**, "- " lists,
// paragraphs) as React elements rather than raw HTML. `data.optimized` is
// LLM output grounded on third-party scraped content, so it must never be
// injected via dangerouslySetInnerHTML — text here always goes through
// React's normal (auto-escaping) child rendering.
function renderInline(line: string, keyPrefix: string) {
  const parts = line.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-medium">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc pl-6">
        {listItems.map((item, i) => (
          <li key={i} className="my-1 text-sm leading-relaxed text-gray-900">
            {renderInline(item, `${key}-li-${i}`)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  const flushParagraph = (key: string) => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={key} className="mb-3 text-sm leading-relaxed text-gray-900">
        {renderInline(paragraphLines.join(" "), key)}
      </p>,
    );
    paragraphLines = [];
  };

  lines.forEach((line, i) => {
    const key = `b-${i}`;
    if (line.startsWith("### ")) {
      flushList(key);
      flushParagraph(key);
      blocks.push(
        <h3 key={key} className="mb-1.5 mt-5 text-[15px] font-medium text-gray-900">
          {renderInline(line.slice(4), key)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flushList(key);
      flushParagraph(key);
      blocks.push(
        <h2 key={key} className="mb-2 mt-6 text-[17px] font-medium text-gray-900">
          {renderInline(line.slice(3), key)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      flushList(key);
      flushParagraph(key);
      blocks.push(
        <h1 key={key} className="mb-2.5 mt-6 text-xl font-medium text-gray-900">
          {renderInline(line.slice(2), key)}
        </h1>,
      );
    } else if (line.startsWith("- ")) {
      flushParagraph(key);
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList(key);
      flushParagraph(key);
    } else {
      flushList(key);
      paragraphLines.push(line);
    }
  });
  flushList("tail-list");
  flushParagraph("tail-p");

  return blocks;
}

export function ResultView({ data }: { data: AnalysisResult }) {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex flex-none items-center gap-4 rounded-lg bg-gray-50 px-5 py-4">
          <ScoreRing score={data.score} />
          <div>
            <p className="m-0 text-xs text-gray-500">AI search score</p>
            <p className="m-0 mb-1 mt-0.5 text-sm font-medium text-gray-900">{data.title}</p>
            {data.target_query && <p className="m-0 mb-1 text-[11px] text-gray-400">Benchmarked against: &quot;{data.target_query}&quot;</p>}
            <p className="m-0 text-[11px] text-gray-400">
              {data.score >= 75 ? "AI-ready" : data.score >= 50 ? "Partially optimized" : "Poor AI visibility"}
            </p>
          </div>
        </div>
        {data.score_breakdown && (
          <div className="min-w-[200px] flex-1 rounded-lg bg-gray-50 px-5 py-4">
            <p className="m-0 mb-2.5 text-xs text-gray-500">AI visibility breakdown</p>
            {AI_DIMS.map(({ key, label }) => {
              const v = data.score_breakdown[key] ?? 0;
              return (
                <div key={key} className="mb-1.5">
                  <div className="mb-0.5 flex justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-xs font-medium text-gray-900">{v}</span>
                  </div>
                  <div className="h-1 rounded bg-gray-200">
                    <div className="h-1 rounded" style={{ width: `${v}%`, background: scoreColor(v) }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 flex overflow-x-auto border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-[13px] ${
              tab === i ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <p className="m-0 text-sm leading-loose text-gray-900">{data.summary}</p>}

      {tab === 1 && data.benchmark && (
        <div>
          <p className="mb-5 text-[13px] text-gray-500">
            Live AI search results for <strong className="font-medium text-gray-900">&quot;{data.benchmark.query}&quot;</strong> — your page
            scored against what AI is actually surfacing.
          </p>
          <div className="mb-3">
            <p className="mb-2 text-xs font-medium text-gray-500">What AI search currently surfaces</p>
            {data.benchmark.what_ai_surfaces?.map((item, i) => (
              <div key={i} className="flex gap-2.5 border-b border-gray-100 py-2">
                <span className="min-w-[18px] pt-px text-xs text-gray-400">{i + 1}</span>
                <p className="m-0 text-[13px] leading-relaxed text-gray-900">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 px-5 py-4">
              <p className="mb-2.5 text-xs font-medium text-green-700">Page covers</p>
              {data.benchmark.page_covers?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug text-gray-900">
                  ✓ {item}
                </p>
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 px-5 py-4">
              <p className="mb-2.5 text-xs font-medium text-red-700">Page misses</p>
              {data.benchmark.page_misses?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug text-gray-900">
                  ✗ {item}
                </p>
              ))}
            </div>
          </div>
          {data.benchmark.unique_to_page?.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-blue-50 px-5 py-4">
              <p className="mb-1.5 text-xs font-medium text-blue-700">Citation opportunities — unique to this page</p>
              <p className="mb-2.5 text-xs text-gray-500">These facts aren&apos;t in AI search results yet — properly structured, they could earn citations.</p>
              {data.benchmark.unique_to_page?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug text-gray-900">
                  ★ {item}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 2 && (
        <div>
          <p className="mb-4 text-[13px] text-gray-500">{data.gaps?.length} gaps identified — grounded in benchmark findings.</p>
          {data.gaps?.map((gap, i) => (
            <GapCard key={i} gap={gap} i={i} />
          ))}
        </div>
      )}

      {tab === 3 && (
        <div>
          {data.stat_warning && (
            <div className="mb-3 flex items-start gap-2.5 rounded-md bg-amber-50 px-4 py-3">
              <span className="text-sm">⚠</span>
              <p className="m-0 text-[13px] leading-relaxed text-amber-800">
                Statistics detected in visual callout format — likely invisible to AI scrapers. The rewrite converts them to fully attributed
                inline sentences.
              </p>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <p className="m-0 text-[13px] text-gray-500">Restructured for AI extraction and citation.</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.optimized);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded border px-3.5 py-1.5 text-[13px]"
            >
              {copied ? "Copied!" : "Copy content"}
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 px-6 py-5">{renderMarkdown(data.optimized)}</div>
        </div>
      )}
    </div>
  );
}
