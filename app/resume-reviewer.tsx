"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type Severity = "critical" | "improve" | "solid";

type Feedback = {
  id: string;
  section: string;
  lineNumber: number;
  line: string;
  severity: Severity;
  title: string;
  detail: string;
};

type SectionSummary = {
  name: string;
  lineCount: number;
  issues: number;
  critical: number;
};

const SECTION_HEADERS = [
  "summary",
  "profile",
  "experience",
  "work experience",
  "employment",
  "projects",
  "education",
  "skills",
  "certifications",
  "awards",
  "leadership",
  "volunteering",
];

const WEAK_WORDS = [
  "responsible for",
  "helped",
  "worked on",
  "assisted",
  "various",
  "many",
  "several",
  "hard-working",
  "team player",
  "detail-oriented",
  "passionate",
];

const ACTION_VERBS = [
  "built",
  "launched",
  "led",
  "owned",
  "reduced",
  "increased",
  "improved",
  "designed",
  "shipped",
  "managed",
  "automated",
  "created",
  "delivered",
  "analyzed",
  "implemented",
  "optimized",
];

const SAMPLE_RESUME = `Ammar Khan
Software Engineer
ammar@example.com | New York, NY

Summary
Hard-working software engineer responsible for building various web applications.

Experience
Software Engineer, Northstar Labs
- Worked on internal dashboard features for operations teams.
- Improved page load time by 38% by replacing blocking data fetches and removing unused client JavaScript.
- Helped with bugs and assisted product managers with requirements.

Projects
- Resume Matcher: Built a local resume review workflow with section-level feedback.

Skills
React, Next.js, TypeScript, Tailwind CSS, Node.js`;

function getSectionName(line: string) {
  const normalized = line.trim().toLowerCase().replace(/:$/, "");
  return SECTION_HEADERS.includes(normalized) ? line.trim().replace(/:$/, "") : null;
}

function isContentLine(line: string) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !getSectionName(trimmed);
}

function sentenceStartsWithAction(line: string) {
  const clean = line.trim().replace(/^[-*•]\s*/, "").toLowerCase();
  return ACTION_VERBS.some((verb) => clean.startsWith(`${verb} `));
}

function analyzeResume(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const feedback: Feedback[] = [];
  const sections = new Map<string, SectionSummary>();
  let currentSection = "Header";

  const ensureSection = (name: string) => {
    if (!sections.has(name)) {
      sections.set(name, { name, lineCount: 0, issues: 0, critical: 0 });
    }
    return sections.get(name)!;
  };

  ensureSection(currentSection);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const detectedSection = getSectionName(trimmed);

    if (detectedSection) {
      currentSection = detectedSection;
      ensureSection(currentSection);
      return;
    }

    if (!isContentLine(line)) return;

    const section = ensureSection(currentSection);
    section.lineCount += 1;
    const lower = trimmed.toLowerCase();
    const issueBase = {
      section: currentSection,
      lineNumber,
      line: trimmed,
    };

    if (trimmed.length > 180) {
      feedback.push({
        ...issueBase,
        id: `${lineNumber}-long`,
        severity: "critical",
        title: "Line is too dense",
        detail:
          "This tries to carry too much at once. Split the thought and lead with the strongest result.",
      });
    }

    if (WEAK_WORDS.some((word) => lower.includes(word))) {
      feedback.push({
        ...issueBase,
        id: `${lineNumber}-weak`,
        severity: "critical",
        title: "Weak or generic wording",
        detail:
          "Replace vague responsibility language with an action verb, scope, and outcome. The line should prove impact, not describe busyness.",
      });
    }

    if ((currentSection.toLowerCase().includes("experience") || trimmed.startsWith("-")) && !/\d/.test(trimmed)) {
      feedback.push({
        ...issueBase,
        id: `${lineNumber}-metric`,
        severity: "improve",
        title: "No measurable result",
        detail:
          "Add a number, scale, frequency, revenue, time saved, users affected, or quality signal so the claim has weight.",
      });
    }

    if (trimmed.startsWith("-") && !sentenceStartsWithAction(trimmed)) {
      feedback.push({
        ...issueBase,
        id: `${lineNumber}-verb`,
        severity: "improve",
        title: "Bullet starts softly",
        detail:
          "Start with a strong past-tense verb such as Built, Led, Reduced, Automated, Shipped, or Improved.",
      });
    }

    if (lower.includes("objective")) {
      feedback.push({
        ...issueBase,
        id: `${lineNumber}-objective`,
        severity: "improve",
        title: "Objective statements are usually weak",
        detail:
          "Use a compact summary of relevant strengths instead. Hiring readers care more about fit and evidence than your objective.",
      });
    }
  });

  for (const item of feedback) {
    const section = ensureSection(item.section);
    section.issues += 1;
    if (item.severity === "critical") section.critical += 1;
  }

  const contentLines = lines.filter(isContentLine).length;
  const score = Math.max(24, Math.min(96, 92 - feedback.length * 7 - feedback.filter((item) => item.severity === "critical").length * 6));

  return {
    feedback,
    sections: Array.from(sections.values()).filter((section) => section.lineCount > 0),
    stats: {
      lines: contentLines,
      sections: Array.from(sections.values()).filter((section) => section.name !== "Header").length,
      issues: feedback.length,
      critical: feedback.filter((item) => item.severity === "critical").length,
      score,
    },
  };
}

function severityLabel(severity: Severity) {
  if (severity === "critical") return "Critical";
  if (severity === "improve") return "Improve";
  return "Solid";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (pageText) pages.push(pageText);
  }

  return pages.join("\n\n");
}

async function extractDocxText(file: File) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}

async function extractResumeText(file: File) {
  const extension = getFileExtension(file.name);

  if (extension === "pdf" || file.type === "application/pdf") {
    return extractPdfText(file);
  }

  if (
    extension === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(file);
  }

  return file.text();
}

export default function ResumeReviewer() {
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyzeResume(resumeText), [resumeText]);
  const resumeLines = useMemo(() => resumeText.replace(/\r\n/g, "\n").split("\n"), [resumeText]);
  const issueLines = useMemo(() => {
    const severities = new Map<number, Severity>();

    for (const item of analysis.feedback) {
      const current = severities.get(item.lineNumber);
      if (item.severity === "critical" || !current) {
        severities.set(item.lineNumber, item.severity);
      }
    }

    return severities;
  }, [analysis.feedback]);

  const hasResume = resumeText.trim().length > 0;

  const loadFile = async (file: File) => {
    setFileError("");
    setSelectedFileName(file.name);
    setIsParsingFile(true);

    try {
      const text = await extractResumeText(file);
      if (!text.trim()) {
        setFileName("");
        setFileError(`${file.name} was selected, but no readable text was found in it.`);
        return;
      }

      setResumeText(text);
      setFileName(file.name);
    } catch {
      setFileName("");
      setFileError(`${file.name} was selected, but I could not parse it locally. Try exporting it as PDF, DOCX, or plain text.`);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const clearResume = () => {
    setResumeText("");
    setFileName("");
    setFileError("");
    setSelectedFileName("");
    setIsParsingFile(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="min-h-screen bg-[oklch(var(--bg))] text-[oklch(var(--ink))]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[oklch(var(--line))] pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[oklch(var(--primary-deep))]">Resume Reviewer</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
              Upload a resume. Get direct line-by-line criticism.
            </h1>
          </div>
          <div className="rounded-md border border-[oklch(var(--success-line))] bg-[oklch(var(--success-bg))] px-3 py-2 text-sm font-medium text-[oklch(var(--success-ink))]">
            Local only. No upload. No storage.
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-5 xl:grid-cols-[360px_minmax(360px,0.9fr)_minmax(420px,1fr)]">
          <div className="flex min-h-[620px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Resume Input</h2>
                <p className="text-sm text-[oklch(var(--muted))]">
                  Paste text or upload a text export. Data lives only in this tab&apos;s memory.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResumeText(SAMPLE_RESUME);
                    setFileName("sample-resume.txt");
                    setSelectedFileName("sample-resume.txt");
                    setFileError("");
                  }}
                  disabled={isParsingFile}
                  className="h-9 rounded-md border border-[oklch(var(--line-strong))] px-3 text-sm font-semibold transition hover:bg-[oklch(var(--surface))] focus:outline-none focus:ring-2 focus:ring-[oklch(var(--focus))]"
                >
                  Try sample
                </button>
                <button
                  type="button"
                  onClick={clearResume}
                  disabled={isParsingFile || (!hasResume && !fileError)}
                  className="h-9 rounded-md border border-[oklch(var(--line-strong))] px-3 text-sm font-semibold transition hover:bg-[oklch(var(--surface))] focus:outline-none focus:ring-2 focus:ring-[oklch(var(--focus))] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Clear
                </button>
              </div>
            </div>

            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition ${
                isDragging
                  ? "border-[oklch(var(--primary))] bg-[oklch(var(--primary-soft))]"
                  : "border-[oklch(var(--line-strong))] bg-[oklch(var(--surface))] hover:border-[oklch(var(--primary))]"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.rtf,.csv,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
              <span className="text-sm font-semibold">Drop a resume file here or choose one</span>
              <span className="mt-1 text-sm text-[oklch(var(--muted))]">
                Supports PDF, DOCX, plain text, Markdown, RTF, CSV, or pasted content.
              </span>
              {selectedFileName ? (
                <span
                  className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${
                    fileError
                      ? "bg-[oklch(var(--warning-bg))] text-[oklch(var(--warning-ink))]"
                      : "bg-[oklch(var(--success-bg))] text-[oklch(var(--success-ink))]"
                  }`}
                >
                  {isParsingFile
                    ? `Parsing: ${selectedFileName}`
                    : fileError
                      ? `Selected: ${selectedFileName}`
                      : `Loaded: ${selectedFileName}`}
                </span>
              ) : null}
            </label>

            {fileError ? (
              <div className="rounded-md border border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))] px-3 py-2 text-sm font-medium text-[oklch(var(--warning-ink))]">
                {fileError}
              </div>
            ) : null}

            <textarea
              value={resumeText}
              onChange={(event) => {
                setResumeText(event.target.value);
                setFileName("");
              }}
              spellCheck={false}
              placeholder="Paste resume text here..."
              className="min-h-[430px] flex-1 resize-none rounded-lg border border-[oklch(var(--line))] bg-white p-4 font-mono text-sm leading-6 text-[oklch(var(--ink))] outline-none transition placeholder:text-[oklch(var(--placeholder))] focus:border-[oklch(var(--primary))] focus:ring-2 focus:ring-[oklch(var(--focus))]"
            />
          </div>

          <ResumePreview
            fileName={fileName}
            hasResume={hasResume}
            issueLines={issueLines}
            lines={resumeLines}
          />

          <div className="flex min-h-[620px] flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Readiness" value={hasResume ? `${analysis.stats.score}%` : "--"} />
              <Metric label="Lines" value={hasResume ? String(analysis.stats.lines) : "--"} />
              <Metric label="Sections" value={hasResume ? String(analysis.stats.sections) : "--"} />
              <Metric label="Critical" value={hasResume ? String(analysis.stats.critical) : "--"} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
              <aside className="rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))] p-3">
                <h2 className="text-sm font-semibold">Sections</h2>
                <div className="mt-3 space-y-2">
                  {hasResume && analysis.sections.length > 0 ? (
                    analysis.sections.map((section) => (
                      <div key={section.name} className="rounded-md bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                          <span>{section.name}</span>
                          <span className="text-[oklch(var(--primary-deep))]">{section.issues}</span>
                        </div>
                        <p className="mt-1 text-xs text-[oklch(var(--muted))]">
                          {section.lineCount} lines, {section.critical} critical
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[oklch(var(--muted))]">
                      Resume sections will appear after you add content.
                    </p>
                  )}
                </div>
              </aside>

              <section className="min-h-[494px] rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))]">
                <div className="flex items-center justify-between gap-3 border-b border-[oklch(var(--line))] px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold">Feedback</h2>
                    <p className="text-sm text-[oklch(var(--muted))]">
                      Sorted by severity and original line number.
                    </p>
                  </div>
                  <span className="rounded-full bg-[oklch(var(--accent))] px-3 py-1 text-xs font-semibold text-white">
                    {hasResume ? `${analysis.stats.issues} issues` : "Waiting"}
                  </span>
                </div>

                <div className="max-h-[620px] space-y-3 overflow-auto p-4">
                  {!hasResume ? (
                    <EmptyState />
                  ) : analysis.feedback.length === 0 ? (
                    <div className="rounded-lg bg-white p-5">
                      <h3 className="font-semibold">No obvious issues found</h3>
                      <p className="mt-2 text-sm leading-6 text-[oklch(var(--muted))]">
                        This heuristic pass did not catch vague lines, missing metrics, or overloaded bullets. A human review can still judge role fit, ordering, and seniority signal.
                      </p>
                    </div>
                  ) : (
                    analysis.feedback
                      .sort((a, b) => {
                        const severityRank = { critical: 0, improve: 1, solid: 2 };
                        return severityRank[a.severity] - severityRank[b.severity] || a.lineNumber - b.lineNumber;
                      })
                      .map((item) => <FeedbackItem key={item.id} item={item} />)
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))] p-3">
      <p className="text-xs font-medium text-[oklch(var(--muted))]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ResumePreview({
  fileName,
  hasResume,
  issueLines,
  lines,
}: {
  fileName: string;
  hasResume: boolean;
  issueLines: Map<number, Severity>;
  lines: string[];
}) {
  return (
    <section className="min-h-[620px] rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[oklch(var(--line))] px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Uploaded Resume</h2>
          <p className="text-sm text-[oklch(var(--muted))]">
            {fileName ? fileName : "Live preview with matching line numbers."}
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[oklch(var(--danger-line))] bg-[oklch(var(--danger-bg))] px-2.5 py-1 text-[oklch(var(--danger-ink))]">
            Critical
          </span>
          <span className="rounded-full border border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))] px-2.5 py-1 text-[oklch(var(--warning-ink))]">
            Improve
          </span>
        </div>
      </div>

      <div className="max-h-[720px] overflow-auto p-3">
        {hasResume ? (
          <ol className="space-y-1 font-mono text-sm leading-6">
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              const severity = issueLines.get(lineNumber);
              const rowClass =
                severity === "critical"
                  ? "border-[oklch(var(--danger-line))] bg-[oklch(var(--danger-bg))]"
                  : severity === "improve"
                    ? "border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))]"
                    : "border-transparent bg-white";

              return (
                <li
                  key={`${lineNumber}-${line}`}
                  className={`grid grid-cols-[3rem_minmax(0,1fr)] rounded-md border px-2 py-1 ${rowClass}`}
                >
                  <span className="select-none text-right text-xs text-[oklch(var(--muted))]">
                    {lineNumber}
                  </span>
                  <span className="min-h-6 whitespace-pre-wrap break-words pl-3 text-[oklch(var(--quote))]">
                    {line || " "}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-lg bg-white p-5">
            <h3 className="font-semibold">Your resume will appear here</h3>
            <p className="mt-2 text-sm leading-6 text-[oklch(var(--muted))]">
              Upload a text resume or paste it into the input panel. The preview stays visible while you compare feedback against the original lines.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FeedbackItem({ item }: { item: Feedback }) {
  const severityClass =
    item.severity === "critical"
      ? "bg-[oklch(var(--danger-bg))] text-[oklch(var(--danger-ink))] border-[oklch(var(--danger-line))]"
      : "bg-[oklch(var(--warning-bg))] text-[oklch(var(--warning-ink))] border-[oklch(var(--warning-line))]";

  return (
    <article className="rounded-lg border border-[oklch(var(--line))] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClass}`}>
          {severityLabel(item.severity)}
        </span>
        <span className="text-xs font-medium text-[oklch(var(--muted))]">
          {item.section} · line {item.lineNumber}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
      <blockquote className="mt-2 border-l border-[oklch(var(--line-strong))] pl-3 font-mono text-sm leading-6 text-[oklch(var(--quote))]">
        {item.line}
      </blockquote>
      <p className="mt-3 text-sm leading-6 text-[oklch(var(--muted))]">{item.detail}</p>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg bg-white p-5">
      <h3 className="font-semibold">Add a resume to start the critique</h3>
      <p className="mt-2 text-sm leading-6 text-[oklch(var(--muted))]">
        The reviewer will flag vague bullets, missing metrics, soft action verbs, overloaded lines, and section-level weak spots.
      </p>
    </div>
  );
}
