"use client";

import { ChangeEvent, DragEvent, RefObject, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";

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

type FeedbackGroup = {
  section: string;
  issues: Feedback[];
};

type ParsedResume = {
  text: string;
  previewImages: string[];
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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapPreviewLine(line: string) {
  if (line.length <= 82) return [line];

  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > 82) {
      if (current) wrapped.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) wrapped.push(current);
  return wrapped;
}

function createResumePreviewImages(text: string, title: string): string[] {
  const normalizedLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => wrapPreviewLine(line || " "));
  const pages: string[] = [];
  const linesPerPage = 48;

  for (let start = 0; start < normalizedLines.length; start += linesPerPage) {
    const pageLines = normalizedLines.slice(start, start + linesPerPage);
    const textRows = pageLines
      .map((line, index) => {
        const y = 104 + index * 18;
        const weight = index === 0 && start === 0 ? 700 : 400;
        return `<text x="72" y="${y}" font-size="13" font-weight="${weight}" fill="oklch(0.205 0.018 62)">${escapeSvgText(line)}</text>`;
      })
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="816" height="1056" viewBox="0 0 816 1056">
      <rect width="816" height="1056" fill="white"/>
      <rect x="0" y="0" width="816" height="8" fill="oklch(0.64 0.155 52)"/>
      <text x="72" y="54" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="oklch(0.43 0.12 48)">${escapeSvgText(title)}</text>
      <g font-family="Arial, sans-serif">${textRows}</g>
    </svg>`;

    pages.push(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }

  return pages.length > 0 ? pages : createResumePreviewImages("No readable resume text found.", title);
}

async function parsePdfResume(file: File): Promise<ParsedResume> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const textPages: string[] = [];
  const previewImages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (pageText) textPages.push(pageText);

    const viewport = page.getViewport({ scale: 1.45 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (context) {
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      previewImages.push(canvas.toDataURL("image/png"));
    }
  }

  return {
    text: textPages.join("\n\n"),
    previewImages,
  };
}

async function parseDocxResume(file: File): Promise<ParsedResume> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value.trim();

  return {
    text,
    previewImages: createResumePreviewImages(text, file.name),
  };
}

async function parseResumeFile(file: File): Promise<ParsedResume> {
  const extension = getFileExtension(file.name);

  if (extension === "pdf" || file.type === "application/pdf") {
    return parsePdfResume(file);
  }

  if (
    extension === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return parseDocxResume(file);
  }

  const text = await file.text();

  return {
    text,
    previewImages: createResumePreviewImages(text, file.name),
  };
}

export default function ResumeReviewer() {
  const [resumeText, setResumeText] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyzeResume(resumeText), [resumeText]);
  const feedbackGroups = useMemo<FeedbackGroup[]>(() => {
    const severityRank = { critical: 0, improve: 1, solid: 2 };
    const groups = new Map<string, Feedback[]>();

    for (const item of analysis.feedback) {
      const group = groups.get(item.section) ?? [];
      group.push(item);
      groups.set(item.section, group);
    }

    return Array.from(groups.entries())
      .map(([section, issues]) => ({
        section,
        issues: issues.sort(
          (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.lineNumber - b.lineNumber,
        ),
      }))
      .sort((a, b) => a.issues[0].lineNumber - b.issues[0].lineNumber);
  }, [analysis.feedback]);

  const hasResume = resumeText.trim().length > 0;

  const loadFile = async (file: File) => {
    setFileError("");
    setSelectedFileName(file.name);
    setIsParsingFile(true);

    try {
      const parsed = await parseResumeFile(file);
      if (!parsed.text.trim()) {
        setFileName("");
        setPreviewImages([]);
        setFileError(`${file.name} was selected, but no readable text was found in it.`);
        return;
      }

      setResumeText(parsed.text);
      setPreviewImages(parsed.previewImages);
      setFileName(file.name);
      setIsUploadOpen(false);
    } catch {
      setFileName("");
      setPreviewImages([]);
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
    setPreviewImages([]);
    setFileName("");
    setFileError("");
    setSelectedFileName("");
    setIsParsingFile(false);
    setIsUploadOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const loadSample = () => {
    setResumeText(SAMPLE_RESUME);
    setPreviewImages(createResumePreviewImages(SAMPLE_RESUME, "sample-resume.txt"));
    setFileName("sample-resume.txt");
    setSelectedFileName("sample-resume.txt");
    setFileError("");
    setIsUploadOpen(false);
  };

  return (
    <main className="min-h-screen bg-[oklch(var(--bg))] text-[oklch(var(--ink))]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="relative flex flex-col gap-4 border-b border-[oklch(var(--line))] pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[oklch(var(--primary-deep))]">Resume Reviewer</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
              Upload a resume. Get direct line-by-line criticism.
            </h1>
          </div>
          <div className="relative">
            <Button
              type="button"
              onClick={() => setIsUploadOpen((value) => !value)}
              aria-expanded={isUploadOpen}
              className="h-10 px-3"
            >
              <FileUp className="size-4" />
              Add resume
            </Button>

            {isUploadOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] rounded-lg border border-[oklch(var(--line))] bg-white p-3 shadow-sm">
                <UploadDropzone
                  fileError={fileError}
                  handleDrop={handleDrop}
                  handleFileChange={handleFileChange}
                  inputRef={inputRef}
                  isDragging={isDragging}
                  isParsingFile={isParsingFile}
                  loadSample={loadSample}
                  selectedFileName={selectedFileName}
                  setIsDragging={setIsDragging}
                />
              </div>
            ) : null}
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(360px,0.95fr)_minmax(440px,1.05fr)]">
          <ResumeImagePreview
            fileName={fileName || selectedFileName}
            isParsingFile={isParsingFile}
            previewImages={previewImages}
          />

          <div className="flex min-h-[620px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Generation & Evaluation</h2>
                <p className="text-sm text-muted-foreground">
                  {hasResume ? fileName : "Add a resume to generate feedback."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={clearResume}
                disabled={isParsingFile || (!hasResume && !fileError)}
              >
                Clear
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Readiness" value={hasResume ? `${analysis.stats.score}%` : "--"} />
              <Metric label="Lines" value={hasResume ? String(analysis.stats.lines) : "--"} />
              <Metric label="Sections" value={hasResume ? String(analysis.stats.sections) : "--"} />
              <Metric label="Critical" value={hasResume ? String(analysis.stats.critical) : "--"} />
            </div>

            <div>
              <section className="min-h-[494px] rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))]">
                <div className="flex items-center justify-between gap-3 border-b border-[oklch(var(--line))] px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold">Feedback</h2>
                    <p className="text-sm text-muted-foreground">
                      Sorted by severity and original line number.
                    </p>
                  </div>
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                    {hasResume ? `${analysis.stats.issues} issues` : "Waiting"}
                  </span>
                </div>

                <div className="max-h-[620px] space-y-3 overflow-auto p-4">
                  {!hasResume ? (
                    <EmptyState />
                  ) : analysis.feedback.length === 0 ? (
                    <div className="rounded-lg bg-white p-5">
                      <h3 className="font-semibold">No obvious issues found</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        This heuristic pass did not catch vague lines, missing metrics, or overloaded bullets. A human review can still judge role fit, ordering, and seniority signal.
                      </p>
                    </div>
                  ) : (
                    feedbackGroups.map((group) => (
                      <section key={group.section} className="space-y-3">
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border border-[oklch(var(--line))] bg-white px-3 py-2">
                          <h3 className="text-sm font-semibold">{group.section}</h3>
                          <span className="text-xs font-medium text-muted-foreground">
                            {group.issues.length} issue{group.issues.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {group.issues.map((item) => (
                          <FeedbackItem key={item.id} item={item} />
                        ))}
                      </section>
                    ))
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
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function UploadDropzone({
  fileError,
  handleDrop,
  handleFileChange,
  inputRef,
  isDragging,
  isParsingFile,
  loadSample,
  selectedFileName,
  setIsDragging,
}: {
  fileError: string;
  handleDrop: (event: DragEvent<HTMLLabelElement>) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  isParsingFile: boolean;
  loadSample: () => void;
  selectedFileName: string;
  setIsDragging: (value: boolean) => void;
}) {
  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition ${
          isDragging
            ? "border-primary bg-[oklch(var(--primary-soft))]"
            : "border-[oklch(var(--line-strong))] bg-white hover:border-primary"
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
        <span className="mt-1 text-sm text-muted-foreground">
          PDF, DOCX, plain text, Markdown, RTF, or CSV.
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
        <div className="mt-3 rounded-md border border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))] px-3 py-2 text-sm font-medium text-[oklch(var(--warning-ink))]">
          {fileError}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" onClick={loadSample} disabled={isParsingFile}>
          Try sample
        </Button>
      </div>
    </div>
  );
}

function ResumeImagePreview({
  fileName,
  isParsingFile,
  previewImages,
}: {
  fileName: string;
  isParsingFile: boolean;
  previewImages: string[];
}) {
  return (
    <section className="min-h-[620px] rounded-lg border border-[oklch(var(--line))] bg-[oklch(var(--surface))]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[oklch(var(--line))] px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Resume Preview</h2>
          <p className="text-sm text-muted-foreground">
            {fileName ? fileName : "The uploaded resume image appears here."}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground">
          {previewImages.length > 0 ? `${previewImages.length} page${previewImages.length === 1 ? "" : "s"}` : "Waiting"}
        </span>
      </div>

      <div className="max-h-[780px] overflow-auto bg-[oklch(var(--preview-bg))] p-4">
        {previewImages.length > 0 ? (
          <div className="space-y-5">
            {previewImages.map((src, index) => (
              <figure key={`${src.slice(0, 64)}-${index}`} className="mx-auto max-w-[760px]">
                <Image
                  src={src}
                  alt={`Resume page ${index + 1}`}
                  width={816}
                  height={1056}
                  unoptimized
                  className="h-auto w-full rounded-sm border border-[oklch(var(--line-strong))] bg-white"
                />
                <figcaption className="mt-2 text-center text-xs font-medium text-muted-foreground">
                  Page {index + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : isParsingFile ? (
          <div className="rounded-lg bg-white p-5">
            <h3 className="font-semibold">Rendering resume preview</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The file is being parsed locally and converted into page images.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-5">
            <h3 className="font-semibold">Your resume will appear here</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload a PDF, DOCX, or text resume. PDFs render as real page images; DOCX and text files render as generated page previews.
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
        <span className="text-xs font-medium text-muted-foreground">
          {item.section} · line {item.lineNumber}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
      <blockquote className="mt-2 border-l border-[oklch(var(--line-strong))] pl-3 font-mono text-sm leading-6 text-[oklch(var(--quote))]">
        {item.line}
      </blockquote>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg bg-white p-5">
      <h3 className="font-semibold">Add a resume to start the critique</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The reviewer will flag vague bullets, missing metrics, soft action verbs, overloaded lines, and section-level weak spots.
      </p>
    </div>
  );
}
