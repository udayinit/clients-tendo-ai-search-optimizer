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

function scoreColorVar(score: number) {
  return score >= 75 ? "var(--color-green)" : score >= 50 ? "var(--color-orange)" : "var(--color-red)";
}

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const cx = 44;
  const cy = 44;
  const stroke = 8;
  const circ = 2 * Math.PI * r;
  const color = scoreColorVar(score);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-separator)" strokeWidth={stroke} />
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
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--color-label)">
        {score}
      </text>
    </svg>
  );
}

function PendingRing() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={44} cy={44} r={36} fill="none" stroke="var(--color-separator)" strokeWidth={8} strokeDasharray="4 6" />
      <text x={44} y={50} textAnchor="middle" fontSize="11" fill="var(--color-tertiary-label)">
        pending
      </text>
    </svg>
  );
}

function GapCard({ gap, i }: { gap: { issue: string; recommendation: string }; i: number }) {
  const badgeClass = ["hig-badge-red", "hig-badge-orange", "hig-badge-blue"];
  const labels = ["High impact", "Medium impact", "Low impact"];
  const c = Math.min(i, 2);
  return (
    <div className="hig-card mb-2.5 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 flex-1 text-[14px] font-medium">{gap.issue}</p>
        <span className={`hig-badge ${badgeClass[c]}`}>{labels[c]}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--color-secondary-label)" }}>
        {gap.recommendation}
      </p>
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
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
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
          <li key={i} className="my-1 text-[14px] leading-relaxed">
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
      <p key={key} className="mb-3 text-[14px] leading-relaxed">
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
        <h3 key={key} className="mb-1.5 mt-5 text-[15px] font-semibold">
          {renderInline(line.slice(4), key)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flushList(key);
      flushParagraph(key);
      blocks.push(
        <h2 key={key} className="mb-2 mt-6 text-[17px] font-semibold">
          {renderInline(line.slice(3), key)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      flushList(key);
      flushParagraph(key);
      blocks.push(
        <h1 key={key} className="mb-2.5 mt-6 text-xl font-semibold">
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
  const availableTabs = TABS.filter((_, i) => {
    if (i === 0) return !!data.summary;
    if (i === 1) return !!data.benchmark;
    if (i === 2) return !!data.gaps;
    return !!data.optimized;
  });

  const [tabLabel, setTabLabel] = useState<string | undefined>(availableTabs[0]);
  const [copied, setCopied] = useState(false);
  const tab = TABS.indexOf(tabLabel && availableTabs.includes(tabLabel) ? tabLabel : (availableTabs[0] ?? TABS[0]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="hig-card flex flex-none items-center gap-4 px-5 py-4">
          {data.score !== undefined ? <ScoreRing score={data.score} /> : <PendingRing />}
          <div>
            <p className="m-0 text-xs" style={{ color: "var(--color-secondary-label)" }}>
              AI search score
            </p>
            <p className="m-0 mb-1 mt-0.5 text-[14px] font-medium">{data.title ?? "Waiting on entity stage..."}</p>
            {data.target_query && (
              <p className="m-0 mb-1 text-[11px]" style={{ color: "var(--color-tertiary-label)" }}>
                Benchmarked against: &quot;{data.target_query}&quot;
              </p>
            )}
            {data.score !== undefined && (
              <p className="m-0 text-[11px]" style={{ color: "var(--color-tertiary-label)" }}>
                {data.score >= 75 ? "AI-ready" : data.score >= 50 ? "Partially optimized" : "Poor AI visibility"}
              </p>
            )}
          </div>
        </div>
        {data.score_breakdown && (
          <div className="hig-card min-w-[200px] flex-1 px-5 py-4">
            <p className="m-0 mb-2.5 text-xs" style={{ color: "var(--color-secondary-label)" }}>
              AI visibility breakdown
            </p>
            {AI_DIMS.map(({ key, label }) => {
              const v = data.score_breakdown?.[key] ?? 0;
              return (
                <div key={key} className="mb-1.5">
                  <div className="mb-0.5 flex justify-between">
                    <span className="text-xs" style={{ color: "var(--color-secondary-label)" }}>
                      {label}
                    </span>
                    <span className="text-xs font-medium">{v}</span>
                  </div>
                  <div className="h-1 rounded" style={{ background: "var(--color-secondary-system-background)" }}>
                    <div className="h-1 rounded" style={{ width: `${v}%`, background: scoreColorVar(v) }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {availableTabs.length > 0 && (
        <div className="hig-segmented mb-6 w-fit overflow-x-auto">
          {availableTabs.map((t) => (
            <button key={t} onClick={() => setTabLabel(t)} data-active={tabLabel === t} className="hig-segmented-item">
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === 0 && data.summary && <p className="m-0 text-[15px] leading-loose">{data.summary}</p>}

      {tab === 1 && data.benchmark && (
        <div>
          <p className="mb-5 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
            Live AI search results for <strong className="font-medium">&quot;{data.benchmark.query}&quot;</strong> — your page scored against
            what AI is actually surfacing.
          </p>
          <div className="hig-card mb-3">
            <p className="hig-eyebrow px-5 pt-4">What AI search currently surfaces</p>
            {data.benchmark.what_ai_surfaces?.map((item, i) => (
              <div key={i} className="hig-list-row flex gap-2.5">
                <span className="min-w-[18px] pt-px text-xs" style={{ color: "var(--color-tertiary-label)" }}>
                  {i + 1}
                </span>
                <p className="m-0 text-[13px] leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="hig-card px-5 py-4">
              <p className="mb-2.5 text-xs font-medium" style={{ color: "var(--color-green)" }}>
                Page covers
              </p>
              {data.benchmark.page_covers?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug">
                  ✓ {item}
                </p>
              ))}
            </div>
            <div className="hig-card px-5 py-4">
              <p className="mb-2.5 text-xs font-medium" style={{ color: "var(--color-red)" }}>
                Page misses
              </p>
              {data.benchmark.page_misses?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug">
                  ✗ {item}
                </p>
              ))}
            </div>
          </div>
          {data.benchmark.unique_to_page?.length > 0 && (
            <div className="mt-3 rounded-lg px-5 py-4" style={{ background: "var(--color-tint-indigo-bg)" }}>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--color-indigo)" }}>
                Citation opportunities — unique to this page
              </p>
              <p className="mb-2.5 text-xs" style={{ color: "var(--color-secondary-label)" }}>
                These facts aren&apos;t in AI search results yet — properly structured, they could earn citations.
              </p>
              {data.benchmark.unique_to_page?.map((item, i) => (
                <p key={i} className="mb-1.5 text-[13px] leading-snug">
                  ★ {item}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 2 && data.gaps && (
        <div>
          <p className="mb-4 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
            {data.gaps.length} gaps identified — grounded in benchmark findings.
          </p>
          {data.gaps.map((gap, i) => (
            <GapCard key={i} gap={gap} i={i} />
          ))}
        </div>
      )}

      {tab === 3 && data.optimized && (
        <div>
          {data.stat_warning && (
            <div className="mb-3 flex items-start gap-2.5 rounded-md px-4 py-3" style={{ background: "var(--color-tint-orange-bg)" }}>
              <span className="text-sm">⚠</span>
              <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--color-orange)" }}>
                Statistics detected in visual callout format — likely invisible to AI scrapers. The rewrite converts them to fully attributed
                inline sentences.
              </p>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <p className="m-0 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
              Restructured for AI extraction and citation.
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.optimized ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="hig-btn hig-btn-secondary"
            >
              {copied ? "Copied!" : "Copy content"}
            </button>
          </div>
          <div className="hig-card px-6 py-5">{renderMarkdown(data.optimized)}</div>
        </div>
      )}
    </div>
  );
}
