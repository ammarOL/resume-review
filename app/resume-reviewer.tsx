"use client";

import { ChangeEvent, DragEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Download, FileUp, LoaderCircle, Star, X } from "lucide-react";

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

type AnalysisResult = {
  feedback: Feedback[];
  sections: SectionSummary[];
  stats: {
    lines: number;
    sections: number;
    issues: number;
    critical: number;
    score: number;
  };
};

type HighlightArea = {
  pageIndex: number;
  lineNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type ParsedResume = {
  text: string;
  previewImages: string[];
  highlightAreas: HighlightArea[];
};

const REVIEW_LOADING_MESSAGES = [
  "Loading review, hang tight.",
  "Reading for weak phrasing and missing proof.",
  "Checking bullets for impact and specificity.",
  "Scoring the resume against practical hiring signals.",
];

const EMPTY_ANALYSIS: AnalysisResult = {
  feedback: [],
  sections: [],
  stats: {
    lines: 0,
    sections: 0,
    issues: 0,
    critical: 0,
    score: 0,
  },
};

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

function createResumePreviewData(text: string, title: string): Pick<ParsedResume, "previewImages" | "highlightAreas"> {
  const normalizedLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line, lineIndex) =>
      wrapPreviewLine(line || " ").map((wrappedLine) => ({
        line: wrappedLine,
        lineNumber: lineIndex + 1,
      })),
    );
  const pages: string[] = [];
  const highlightAreas: HighlightArea[] = [];
  const linesPerPage = 48;

  for (let start = 0; start < normalizedLines.length; start += linesPerPage) {
    const pageLines = normalizedLines.slice(start, start + linesPerPage);
    const pageIndex = pages.length;
    const textRows = pageLines
      .map(({ line, lineNumber }, index) => {
        const y = 104 + index * 18;
        const weight = index === 0 && start === 0 ? 700 : 400;
        const width = Math.min(672, Math.max(32, line.trim().length * 7.1));
        highlightAreas.push({
          pageIndex,
          lineNumber,
          left: 72 / 816,
          top: (y - 13) / 1056,
          width: width / 816,
          height: 17 / 1056,
        });
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

  if (pages.length > 0) {
    return { previewImages: pages, highlightAreas };
  }

  return createResumePreviewData("No readable resume text found.", title);
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
  const highlightAreas: HighlightArea[] = [];
  let lineNumber = 1;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.45 });
    for (const item of textContent.items) {
      if (!("str" in item)) continue;

      const text = item.str.trim();

      if (text) {
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const left = transform[4] / viewport.width;
        const top = (transform[5] - item.height) / viewport.height;
        const width = item.width / viewport.width;
        const height = Math.max(item.height, 8) / viewport.height;

        highlightAreas.push({
          pageIndex: pageNumber - 1,
          lineNumber,
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: Math.min(1 - Math.max(0, left), Math.max(width, 0.012)),
          height: Math.min(0.05, Math.max(height, 0.012)),
        });
      }

      if (item.hasEOL) {
        lineNumber += 1;
      }
    }

    const pageText = textContent.items
      .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (pageText) textPages.push(pageText);

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
    highlightAreas,
  };
}

async function parseDocxResume(file: File): Promise<ParsedResume> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value.trim();

  return {
    text,
    ...createResumePreviewData(text, file.name),
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
    ...createResumePreviewData(text, file.name),
  };
}

function reportSeverityLabel(severity: Severity) {
  if (severity === "critical") return "Critical";
  if (severity === "improve") return "Improve";
  return "Strength";
}

function createFeedbackGroups(feedback: Feedback[]) {
  const severityRank = { critical: 0, improve: 1, solid: 2 };
  const groups = new Map<string, Feedback[]>();

  for (const item of feedback) {
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
}

function reportText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getPdfTextWidth(doc: { getTextWidth?: (text: string) => number }, text: string) {
  return doc.getTextWidth?.(text) ?? text.length * 4.5;
}

async function downloadReviewReport(analysis: AnalysisResult, selectedFileName: string, previewImages: string[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const baseName = selectedFileName.trim().replace(/\.[^.]+$/, "") || "resume";
  const safeBaseName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resume";
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const counts = analysis.feedback.reduce<Record<Severity, number>>(
    (totals, item) => {
      totals[item.severity] += 1;
      return totals;
    },
    { critical: 0, improve: 0, solid: 0 },
  );

  const setInk = () => doc.setTextColor(32, 31, 29);
  const setMuted = () => doc.setTextColor(102, 97, 93);
  const drawLine = (y: number) => {
    doc.setDrawColor(222, 219, 216);
    doc.line(margin, y, pageWidth - margin, y);
  };
  const ensureSpace = (needed: number, y: number) => {
    if (y + needed <= pageHeight - margin) return y;

    doc.addPage();
    return margin;
  };
  const wrapTextToWidth = (text: string, maxWidth: number) => {
    const words = reportText(text).split(" ").filter(Boolean);
    const lines: string[] = [];
    let line = "";

    const pushLine = () => {
      if (!line) return;
      lines.push(line);
      line = "";
    };
    const pushLongWord = (word: string) => {
      let chunk = "";

      for (const character of word) {
        const nextChunk = `${chunk}${character}`;
        if (chunk && getPdfTextWidth(doc, nextChunk) > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = nextChunk;
        }
      }

      line = chunk;
    };

    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;

      if (getPdfTextWidth(doc, nextLine) <= maxWidth) {
        line = nextLine;
      } else if (getPdfTextWidth(doc, word) > maxWidth) {
        pushLine();
        pushLongWord(word);
      } else {
        pushLine();
        line = word;
      }
    }

    pushLine();
    return lines.length ? lines : [" "];
  };
  const addWrappedText = ({
    color = "ink",
    font = "normal",
    fontSize,
    lineGap = 4,
    maxWidth = contentWidth,
    text,
    x = margin,
    y,
  }: {
    color?: "ink" | "muted";
    font?: "bold" | "normal";
    fontSize: number;
    lineGap?: number;
    maxWidth?: number;
    text: string;
    x?: number;
    y: number;
  }) => {
    doc.setFont("helvetica", font);
    doc.setFontSize(fontSize);
    if (color === "muted") setMuted();
    else setInk();

    const lines = wrapTextToWidth(text || " ", maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * (fontSize + lineGap);
  };
  const addFooter = (page: number, totalPages: number) => {
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 26, { align: "right" });
  };

  doc.setProperties({
    title: `${baseName} Resume Review Report`,
    subject: "Resume review report",
    creator: "Resume Reviewer",
  });

  let y = margin + 8;
  y = addWrappedText({
    font: "bold",
    fontSize: 25,
    lineGap: 6,
    text: `${baseName} Resume Review Report`,
    y,
  });
  y = addWrappedText({
    color: "muted",
    fontSize: 9,
    maxWidth: contentWidth - 8,
    text: `Generated ${generatedAt} from the AI resume review currently shown in Resume Reviewer.`,
    y: y + 6,
  });
  y = addWrappedText({
    color: "muted",
    fontSize: 9,
    maxWidth: contentWidth - 8,
    text: "Generated at resreview.byammar.com.",
    y: y + 2,
  });
  y += 20;
  drawLine(y);
  y += 26;

  const scoreCardWidth = 132;
  const metricWidth = (contentWidth - scoreCardWidth - 32) / 4;
  const metricY = y;
  const metrics = [
    { label: "Total feedback", value: `${analysis.stats.issues}` },
    { label: "Critical", value: `${counts.critical}` },
    { label: "Improve", value: `${counts.improve}` },
    { label: "Strengths", value: `${counts.solid}` },
  ];

  doc.setFillColor(32, 31, 29);
  doc.setDrawColor(32, 31, 29);
  doc.rect(margin, metricY, scoreCardWidth, 66, "FD");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(`${analysis.stats.score}`, margin + 16, metricY + 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Resume rating", margin + 16, metricY + 49);

  metrics.forEach((metric, index) => {
    const x = margin + scoreCardWidth + 8 + index * (metricWidth + 8);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(222, 219, 216);
    doc.rect(x, metricY, metricWidth, 66, "FD");
    setInk();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(metric.value, x + 12, metricY + 28);
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(metric.label, x + 12, metricY + 48, { maxWidth: metricWidth - 24 });
  });

  y += 100;
  const groups = createFeedbackGroups(analysis.feedback);

  if (groups.length === 0) {
    y = addWrappedText({ font: "bold", fontSize: 14, text: "No obvious issues found", y });
    addWrappedText({
      color: "muted",
      fontSize: 10,
      text: "This review did not identify specific feedback items.",
      y: y + 8,
    });
  }

  for (const group of groups) {
    y = ensureSpace(72, y);
    drawLine(y);
    y += 22;
    y = addWrappedText({ font: "bold", fontSize: 14, text: group.section, y });
    setMuted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${group.issues.length} item${group.issues.length === 1 ? "" : "s"}`, pageWidth - margin, y - 18, {
      align: "right",
    });
    y += 8;

    for (const item of group.issues) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const titleLines = wrapTextToWidth(item.title, contentWidth - 40);
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      const lineLines = wrapTextToWidth(item.line || " ", contentWidth - 64);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const detailLines = wrapTextToWidth(item.detail, contentWidth - 40);
      const itemHeight =
        56 + titleLines.length * 15 + lineLines.length * 11 + detailLines.length * 13 + 24;

      y = ensureSpace(itemHeight, y);
      const cardTop = y;

      if (item.severity === "critical") doc.setFillColor(255, 241, 239);
      else if (item.severity === "improve") doc.setFillColor(255, 247, 223);
      else doc.setFillColor(237, 246, 255);
      doc.setDrawColor(222, 219, 216);
      doc.rect(margin, cardTop, contentWidth, itemHeight - 12, "FD");

      setMuted();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`${reportSeverityLabel(item.severity)}   Line ${item.lineNumber}`, margin + 16, cardTop + 20);

      y = addWrappedText({
        font: "bold",
        fontSize: 12,
        maxWidth: contentWidth - 40,
        text: reportText(item.title),
        x: margin + 16,
        y: cardTop + 42,
      });

      y += 6;
      setMuted();
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.setFillColor(255, 255, 255);
      doc.rect(margin + 16, y - 10, contentWidth - 32, lineLines.length * 11 + 10, "F");
      doc.text(lineLines, margin + 24, y);
      y += lineLines.length * 11 + 16;

      y = addWrappedText({
        fontSize: 10,
        maxWidth: contentWidth - 40,
        text: reportText(item.detail),
        x: margin + 16,
        y,
      });
      y = cardTop + itemHeight + 8;
    }
  }

  const resumePreviewPages = previewImages.filter((image) => /^data:image\/(?:png|jpe?g|webp)/i.test(image)).slice(0, 6);
  for (const [index, image] of resumePreviewPages.entries()) {
    doc.addPage();
    let previewY = margin;
    previewY = addWrappedText({
      font: "bold",
      fontSize: 18,
      text: `Resume Preview${resumePreviewPages.length > 1 ? ` - Page ${index + 1}` : ""}`,
      y: previewY,
    });
    previewY += 18;
    drawLine(previewY);
    previewY += 22;

    const imageType = image.startsWith("data:image/jpeg") || image.startsWith("data:image/jpg") ? "JPEG" : image.startsWith("data:image/webp") ? "WEBP" : "PNG";
    const previewWidth = contentWidth;
    const previewHeight = pageHeight - previewY - margin - 20;
    const resumeAspectRatio = 8.5 / 11;
    let imageWidth = previewWidth;
    let imageHeight = imageWidth / resumeAspectRatio;

    if (imageHeight > previewHeight) {
      imageHeight = previewHeight;
      imageWidth = imageHeight * resumeAspectRatio;
    }

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(222, 219, 216);
    doc.rect(margin + (contentWidth - imageWidth) / 2 - 6, previewY - 6, imageWidth + 12, imageHeight + 12, "FD");
    doc.addImage(image, imageType, margin + (contentWidth - imageWidth) / 2, previewY, imageWidth, imageHeight);
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    addFooter(page, totalPages);
  }

  doc.save(`${safeBaseName}-review-report.pdf`);
}

export default function ResumeReviewer() {
  const [resumeText, setResumeText] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [highlightAreas, setHighlightAreas] = useState<HighlightArea[]>([]);
  const [fileError, setFileError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [modelAnalysis, setModelAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);
  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isReviewingResume, setIsReviewingResume] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reviewLoadingMessageIndex, setReviewLoadingMessageIndex] = useState(0);
  const [isDataWarningClosing, setIsDataWarningClosing] = useState(false);
  const [isDataWarningDismissed, setIsDataWarningDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackItemRefs = useRef(new Map<string, HTMLElement>());
  const warningDismissTimeoutRef = useRef<number | null>(null);
  const analysis = modelAnalysis ?? EMPTY_ANALYSIS;

  useEffect(() => {
    if (!resumeText.trim()) {
      return;
    }

    const controller = new AbortController();

    async function generateReview() {
      try {
        const response = await fetch("/api/review-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText }),
          signal: controller.signal,
        });
        const result = (await response.json()) as AnalysisResult | { error?: string };

        if (!response.ok) {
          throw new Error("error" in result && result.error ? result.error : "Review request failed.");
        }

        setModelAnalysis(result as AnalysisResult);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error("Resume review failed", error);
        setModelAnalysis(null);
        setReviewError("AI review is unavailable. Check your API key or try the upload again.");
      } finally {
        if (!controller.signal.aborted) setIsReviewingResume(false);
      }
    }

    void generateReview();

    return () => controller.abort();
  }, [resumeText]);

  useEffect(() => {
    if (!isReviewingResume) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setReviewLoadingMessageIndex((index) => (index + 1) % REVIEW_LOADING_MESSAGES.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [isReviewingResume]);

  useEffect(() => {
    return () => {
      if (warningDismissTimeoutRef.current) {
        window.clearTimeout(warningDismissTimeoutRef.current);
      }
    };
  }, []);
  const activeLineNumber = useMemo(() => {
    if (!activeFeedbackId) return null;
    return analysis.feedback.find((item) => item.id === activeFeedbackId)?.lineNumber ?? null;
  }, [activeFeedbackId, analysis.feedback]);
  const flaggedLineSeverities = useMemo(() => {
    const severityRank = { critical: 0, improve: 1, solid: 2 };
    const lines = new Map<number, Severity>();

    for (const item of analysis.feedback) {
      const current = lines.get(item.lineNumber);
      if (!current || severityRank[item.severity] < severityRank[current]) {
        lines.set(item.lineNumber, item.severity);
      }
    }

    return lines;
  }, [analysis.feedback]);
  const feedbackIdByLine = useMemo(() => {
    const severityRank = { critical: 0, improve: 1, solid: 2 };
    const feedbackByLine = new Map<number, Feedback>();

    for (const item of analysis.feedback) {
      const current = feedbackByLine.get(item.lineNumber);
      if (!current || severityRank[item.severity] < severityRank[current.severity]) {
        feedbackByLine.set(item.lineNumber, item);
      }
    }

    return new Map(
      Array.from(feedbackByLine.entries()).map(([lineNumber, item]) => [lineNumber, item.id]),
    );
  }, [analysis.feedback]);
  const severityCounts = useMemo(
    () =>
      analysis.feedback.reduce<Record<Severity, number>>(
        (counts, item) => {
          counts[item.severity] += 1;
          return counts;
        },
        { critical: 0, improve: 0, solid: 0 },
      ),
    [analysis.feedback],
  );
  const feedbackGroups = useMemo<FeedbackGroup[]>(() => {
    const severityRank = { critical: 0, improve: 1, solid: 2 };
    const groups = new Map<string, Feedback[]>();

    for (const item of analysis.feedback) {
      if (selectedSeverity && item.severity !== selectedSeverity) continue;

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
  }, [analysis.feedback, selectedSeverity]);

  const hasResume = resumeText.trim().length > 0;
  const isWaitingForModelReview = hasResume && isReviewingResume && !modelAnalysis;
  const isReviewUnavailable = hasResume && !isReviewingResume && !modelAnalysis && Boolean(reviewError);
  const isBusyWithResume = isParsingFile || isWaitingForModelReview;
  const shouldShowDataWarning = hasResume && Boolean(modelAnalysis) && !isDataWarningDismissed;

  useEffect(() => {
    if (!hasResume) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasResume]);

  const loadFile = async (file: File) => {
    setFileError("");
    setSelectedFileName(file.name);
    setIsParsingFile(true);

    try {
      const parsed = await parseResumeFile(file);
      if (!parsed.text.trim()) {
        setPreviewImages([]);
        setHighlightAreas([]);
        setFileError(`${file.name} was selected, but no readable text was found in it.`);
        setIsReviewingResume(false);
        return;
      }

      setModelAnalysis(null);
      setReviewError("");
      setReviewLoadingMessageIndex(0);
      setIsDataWarningClosing(false);
      setIsDataWarningDismissed(false);
      setIsReviewingResume(true);
      setResumeText(parsed.text);
      setPreviewImages(parsed.previewImages);
      setHighlightAreas(parsed.highlightAreas);
      setActiveFeedbackId(null);
      setIsUploadOpen(false);
    } catch {
      setPreviewImages([]);
      setHighlightAreas([]);
      setFileError(`${file.name} was selected, but I could not parse it locally. Try exporting it as PDF, DOCX, or plain text.`);
      setIsReviewingResume(false);
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
    setHighlightAreas([]);
    setFileError("");
    setReviewError("");
    setModelAnalysis(null);
    setReviewLoadingMessageIndex(0);
    setIsDataWarningClosing(false);
    setIsDataWarningDismissed(false);
    setSelectedFileName("");
    setSelectedSeverity(null);
    setActiveFeedbackId(null);
    setIsParsingFile(false);
    setIsReviewingResume(false);
    setIsUploadOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDownloadReport = async () => {
    if (!modelAnalysis || isDownloadingReport) return;

    setIsDownloadingReport(true);
    try {
      await downloadReviewReport(modelAnalysis, selectedFileName, previewImages);
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const dismissDataWarning = () => {
    if (isDataWarningClosing) return;

    setIsDataWarningClosing(true);
    warningDismissTimeoutRef.current = window.setTimeout(() => {
      setIsDataWarningDismissed(true);
      setIsDataWarningClosing(false);
      warningDismissTimeoutRef.current = null;
    }, 220);
  };

  const selectFeedback = (feedbackId: string, shouldScroll = false) => {
    setActiveFeedbackId(feedbackId);

    if (!shouldScroll) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        feedbackItemRefs.current.get(feedbackId)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

  const selectFeedbackFromLine = (lineNumber: number) => {
    const feedbackId = feedbackIdByLine.get(lineNumber);
    if (feedbackId) selectFeedback(feedbackId, true);
  };

  return (
    <main className="min-h-screen bg-[oklch(var(--bg))] text-[oklch(var(--ink))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 sm:px-6">
        <header className="relative flex flex-col gap-3 border-b border-[oklch(var(--line))] pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Resume Reviewer</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Upload a resume, inspect the source document, and review direct section-level feedback.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/ammarOL/resume-review"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/45 active:translate-y-px"
            >
              <Star className="size-4" />
              Star on GitHub
            </a>
            {modelAnalysis ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadReport}
                disabled={isDownloadingReport}
                aria-busy={isDownloadingReport}
                className="h-9 rounded-[2px] px-3"
              >
                {isDownloadingReport ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {isDownloadingReport ? "Preparing" : "Download report"}
              </Button>
            ) : null}
            {hasResume ? (
              <Button
                type="button"
                variant="outline"
                onClick={clearResume}
                disabled={isBusyWithResume}
                aria-busy={isBusyWithResume}
                className="h-9 rounded-[2px] px-3"
              >
                {isBusyWithResume ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                {isBusyWithResume ? "Reviewing" : "Clear"}
              </Button>
            ) : null}
            <div className="relative">
              <Button
                type="button"
                onClick={() => setIsUploadOpen((value) => !value)}
                aria-expanded={isUploadOpen}
                aria-busy={isBusyWithResume}
                disabled={isBusyWithResume}
                className="h-9 rounded-[2px] px-3"
              >
                {isBusyWithResume ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <FileUp className="size-4" />
                )}
                {isParsingFile ? "Parsing" : isWaitingForModelReview ? "Reviewing" : "Add resume"}
              </Button>

              {isUploadOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] rounded-[2px] border border-[oklch(var(--line-strong))] bg-white p-3">
                  <UploadDropzone
                    fileError={fileError}
                    handleDrop={handleDrop}
                    handleFileChange={handleFileChange}
                    inputRef={inputRef}
                    isDragging={isDragging}
                    isParsingFile={isParsingFile}
                    selectedFileName={selectedFileName}
                    setIsDragging={setIsDragging}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[minmax(360px,0.95fr)_minmax(440px,1.05fr)]">
          <ResumeImagePreview
            activeLineNumber={activeLineNumber}
            flaggedLineSeverities={flaggedLineSeverities}
            highlightAreas={highlightAreas}
            isParsingFile={isParsingFile}
            onHighlightSelect={selectFeedbackFromLine}
            previewImages={previewImages}
          />

          <div className="flex min-h-[620px] flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Generation & Evaluation</h2>
              </div>
              {modelAnalysis ? <ResumeScore score={modelAnalysis.stats.score} /> : null}
            </div>
            {shouldShowDataWarning ? (
              <DataRetentionWarning
                isClosing={isDataWarningClosing}
                onDismiss={dismissDataWarning}
              />
            ) : null}
            {isWaitingForModelReview || isReviewUnavailable ? (
              <div className="border-y border-[oklch(var(--line))] py-2" aria-hidden="true" />
            ) : (
              <SeverityLegend
                counts={severityCounts}
                selectedSeverity={selectedSeverity}
                setSelectedSeverity={setSelectedSeverity}
              />
            )}
            {reviewError ? (
              <div className="rounded-[2px] border border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))] px-3 py-2 text-sm font-medium text-[oklch(var(--warning-ink))]">
                {reviewError}
              </div>
            ) : null}

            <div>
              <section className="min-h-[494px] rounded-[2px] border border-[oklch(var(--line))] bg-[oklch(var(--surface))]">
                <div>
                  {!hasResume ? (
                    <NoDataEmptyState
                      description="Upload a resume to generate direct, section-level feedback. Issues will appear here after parsing."
                      imageSrc="/undraw_to-do-app_esjl.svg"
                      imageSize="sm"
                      title="No feedback yet"
                    />
                  ) : isWaitingForModelReview ? (
                    <FeedbackLoadingState
                      message={REVIEW_LOADING_MESSAGES[reviewLoadingMessageIndex]}
                    />
                  ) : isReviewUnavailable ? (
                    <ReviewUnavailableState />
                  ) : analysis.feedback.length === 0 ? (
                    <div className="animate-[feedback-in_180ms_ease-out_both] bg-white p-4">
                      <h3 className="font-semibold">No obvious issues found</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        This review did not catch vague lines, missing metrics, or overloaded bullets. A human review can still judge role fit, ordering, and seniority signal.
                      </p>
                    </div>
                  ) : feedbackGroups.length === 0 ? (
                    <div className="animate-[feedback-in_180ms_ease-out_both] bg-white p-4">
                      <h3 className="font-semibold">No issues at this severity</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Clear the severity filter or choose another level to continue reviewing.
                      </p>
                    </div>
                  ) : (
                    feedbackGroups.map((group, groupIndex) => (
                      <section
                        key={group.section}
                        className="animate-[feedback-in_180ms_ease-out_both]"
                        style={{ animationDelay: `${Math.min(groupIndex * 35, 140)}ms` }}
                      >
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-y border-[oklch(var(--line))] bg-[oklch(var(--surface))] px-4 py-2 first:border-t-0">
                          <h3 className="text-sm font-semibold">{group.section}</h3>
                          <span className="text-xs font-medium text-muted-foreground">
                            {group.issues.length} issue{group.issues.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {group.issues.map((item) => (
                          <FeedbackItem
                            key={item.id}
                            isActive={activeFeedbackId === item.id}
                            item={item}
                            onRef={(element) => {
                              if (element) {
                                feedbackItemRefs.current.set(item.id, element);
                              } else {
                                feedbackItemRefs.current.delete(item.id);
                              }
                            }}
                            onSelect={() => selectFeedback(item.id)}
                          />
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

function DataRetentionWarning({
  isClosing,
  onDismiss,
}: {
  isClosing: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isClosing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <section
        role="status"
        aria-live="polite"
        className={`min-h-0 overflow-hidden rounded-[2px] border border-[oklch(var(--line))] bg-white px-3 py-2 text-muted-foreground transition-transform duration-200 ease-out ${
          isClosing ? "-translate-y-1" : "translate-y-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[oklch(var(--placeholder))]" aria-hidden="true" />
            <div>
              <h3 className="text-xs font-semibold text-[oklch(var(--ink))]">Download before leaving</h3>
              <p className="mt-0.5 max-w-2xl text-xs leading-5">
                This review is only stored in this browser tab. Closing or refreshing the tab will delete the uploaded resume and generated feedback.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss data warning"
            onClick={onDismiss}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/45 active:translate-y-px"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
}

function ResumeScore({ score }: { score: number }) {
  return (
    <div
      aria-label={`Resume rating ${score} out of 100`}
      className="min-w-24 bg-white px-1 py-1 text-right"
    >
      <p className="text-xs font-medium text-muted-foreground">Resume rating</p>
      <p className="mt-0.5 text-lg font-semibold leading-none text-[oklch(var(--ink))]">
        {score}
        <span className="text-xs font-medium text-muted-foreground">/100</span>
      </p>
    </div>
  );
}

function FeedbackLoadingState({ message }: { message: string }) {
  return (
    <div
      className="flex min-h-[494px] flex-col items-center justify-center bg-white px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mb-5 flex items-center gap-1.5" aria-hidden="true">
        <span className="size-2 animate-[loading-dot_900ms_ease-in-out_infinite] rounded-full bg-[oklch(var(--ink))]" />
        <span className="size-2 animate-[loading-dot_900ms_ease-in-out_150ms_infinite] rounded-full bg-[oklch(var(--ink))]" />
        <span className="size-2 animate-[loading-dot_900ms_ease-in-out_300ms_infinite] rounded-full bg-[oklch(var(--ink))]" />
      </div>
      <h3 className="text-base font-semibold">Loading review</h3>
      <p key={message} className="mt-2 max-w-sm animate-[feedback-in_180ms_ease-out_both] text-sm leading-6 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function ReviewUnavailableState() {
  return (
    <div className="flex min-h-[494px] flex-col items-center justify-center bg-white px-6 py-12 text-center">
      <h3 className="text-base font-semibold">Review unavailable</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        The resume was parsed, but the AI review could not be generated. Check the API key and try uploading again.
      </p>
    </div>
  );
}

function SeverityLegend({
  counts,
  selectedSeverity,
  setSelectedSeverity,
}: {
  counts: Record<Severity, number>;
  selectedSeverity: Severity | null;
  setSelectedSeverity: (severity: Severity | null) => void;
}) {
  const levels = [
    {
      label: "Informative",
      severity: "solid" as const,
      className: "border-[oklch(var(--info-line))] text-[oklch(var(--info-ink))]",
    },
    {
      label: "Improve",
      severity: "improve" as const,
      className: "border-[oklch(var(--warning-line))] text-[oklch(var(--warning-ink))]",
    },
    {
      label: "Critical",
      severity: "critical" as const,
      className: "border-[oklch(var(--danger-line))] text-[oklch(var(--danger-ink))]",
    },
  ];

  return (
    <div className="border-y border-[oklch(var(--line))] py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-xs font-medium text-muted-foreground">Feedback severity</p>
          {levels.map((level) => (
            <button
              type="button"
              key={level.label}
              aria-pressed={selectedSeverity === level.severity}
              disabled={counts[level.severity] === 0}
              onClick={() =>
                setSelectedSeverity(selectedSeverity === level.severity ? null : level.severity)
              }
              className={`cursor-pointer border-l-2 pl-2 text-left text-xs font-semibold transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring/45 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:underline aria-pressed:underline-offset-4 ${level.className}`}
            >
              {level.label}
              <span className="ml-1 font-medium text-muted-foreground">({counts[level.severity]})</span>
            </button>
          ))}
        </div>
        {selectedSeverity ? (
          <button
            type="button"
            onClick={() => setSelectedSeverity(null)}
            className="ml-auto cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-4 transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/45 active:translate-y-px"
          >
            Show all
          </button>
        ) : null}
      </div>
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
  selectedFileName,
  setIsDragging,
}: {
  fileError: string;
  handleDrop: (event: DragEvent<HTMLLabelElement>) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  isParsingFile: boolean;
  selectedFileName: string;
  setIsDragging: (value: boolean) => void;
}) {
  return (
    <div>
      <label
        onDragOver={(event) => {
          if (isParsingFile) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => {
          if (!isParsingFile) setIsDragging(false);
        }}
        onDrop={(event) => {
          if (isParsingFile) {
            event.preventDefault();
            return;
          }
          handleDrop(event);
        }}
        aria-disabled={isParsingFile}
        className={`flex flex-col items-center justify-center rounded-[2px] border border-dashed px-4 py-6 text-center transition ${
          isParsingFile
            ? "cursor-not-allowed border-[oklch(var(--line))] bg-[oklch(var(--muted))] opacity-75"
            : isDragging
              ? "cursor-pointer border-primary bg-[oklch(var(--primary-soft))]"
              : "cursor-pointer border-[oklch(var(--line-strong))] bg-white hover:border-primary"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.rtf,.csv,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
          className="sr-only"
          onChange={handleFileChange}
          disabled={isParsingFile}
        />
        <span className="text-sm font-semibold">Drop a resume file here or choose one</span>
        <span className="mt-1 text-sm text-muted-foreground">
          PDF, DOCX, plain text, Markdown, RTF, or CSV.
        </span>
        {selectedFileName ? (
          <span
            className={`mt-3 rounded-[2px] px-2.5 py-1 text-xs font-semibold ${
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
        <div className="mt-3 rounded-[2px] border border-[oklch(var(--warning-line))] bg-[oklch(var(--warning-bg))] px-3 py-2 text-sm font-medium text-[oklch(var(--warning-ink))]">
          {fileError}
        </div>
      ) : null}

    </div>
  );
}

function ResumeImagePreview({
  activeLineNumber,
  flaggedLineSeverities,
  highlightAreas,
  isParsingFile,
  onHighlightSelect,
  previewImages,
}: {
  activeLineNumber: number | null;
  flaggedLineSeverities: Map<number, Severity>;
  highlightAreas: HighlightArea[];
  isParsingFile: boolean;
  onHighlightSelect: (lineNumber: number) => void;
  previewImages: string[];
}) {
  const previewContentClass = previewImages.length > 0
    ? "overflow-auto bg-[oklch(var(--preview-bg))] p-4 lg:max-h-[calc(100vh-2rem)]"
    : "bg-[oklch(var(--preview-bg))] p-4";

  return (
    <section className="top-4 rounded-[2px] border border-[oklch(var(--line))] bg-[oklch(var(--surface))] lg:sticky lg:max-h-[calc(100vh-2rem)]">
      <div className={previewContentClass}>
        {previewImages.length > 0 ? (
          <div className="space-y-5">
            {previewImages.map((src, index) => (
              <figure key={`${src.slice(0, 64)}-${index}`} className="mx-auto max-w-[760px]">
                <div className="relative border border-[oklch(var(--line-strong))] bg-white">
                  <Image
                    src={src}
                    alt={`Resume page ${index + 1}`}
                    width={816}
                    height={1056}
                    unoptimized
                    className="h-auto w-full"
                  />
                  <ResumeHighlights
                    activeLineNumber={activeLineNumber}
                    flaggedLineSeverities={flaggedLineSeverities}
                    highlightAreas={highlightAreas.filter((area) => area.pageIndex === index)}
                    onHighlightSelect={onHighlightSelect}
                  />
                </div>
                <figcaption className="mt-2 text-center text-xs font-medium text-muted-foreground">
                  Page {index + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : isParsingFile ? (
          <div className="rounded-[2px] bg-white p-4">
            <h3 className="font-semibold">Rendering resume preview</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The file is being parsed locally and converted into page images.
            </p>
          </div>
        ) : (
          <NoDataEmptyState
            description="Upload a PDF, DOCX, or text resume. The document preview will render here after parsing."
            imageSrc="/no-data.svg"
            imageSize="md"
            title="No resume loaded"
          />
        )}
      </div>
    </section>
  );
}

function ResumeHighlights({
  activeLineNumber,
  flaggedLineSeverities,
  highlightAreas,
  onHighlightSelect,
}: {
  activeLineNumber: number | null;
  flaggedLineSeverities: Map<number, Severity>;
  highlightAreas: HighlightArea[];
  onHighlightSelect: (lineNumber: number) => void;
}) {
  const severityClass = (severity: Severity, isActive: boolean) => {
    if (severity === "critical") {
      return isActive
        ? "bg-[oklch(0.82_0.12_26_/_0.48)] ring-1 ring-inset ring-[oklch(0.52_0.14_26_/_0.45)]"
        : "bg-[oklch(0.72_0_0_/_0.16)]";
    }

    if (severity === "improve") {
      return isActive
        ? "bg-[oklch(0.86_0.1_84_/_0.5)] ring-1 ring-inset ring-[oklch(0.55_0.1_84_/_0.45)]"
        : "bg-[oklch(0.72_0_0_/_0.16)]";
    }

    return isActive
      ? "bg-[oklch(0.84_0.075_250_/_0.46)] ring-1 ring-inset ring-[oklch(0.5_0.08_250_/_0.42)]"
      : "bg-[oklch(0.72_0_0_/_0.16)]";
  };
  const highlights = Array.from(
    highlightAreas
      .filter((area) => flaggedLineSeverities.has(area.lineNumber))
      .reduce((areas, area) => {
        const current = areas.get(area.lineNumber);

        if (!current) {
          areas.set(area.lineNumber, area);
          return areas;
        }

        const left = Math.min(current.left, area.left);
        const top = Math.min(current.top, area.top);
        const right = Math.max(current.left + current.width, area.left + area.width);
        const bottom = Math.max(current.top + current.height, area.top + area.height);

        areas.set(area.lineNumber, {
          ...current,
          left,
          top,
          width: right - left,
          height: bottom - top,
        });

        return areas;
      }, new Map<number, HighlightArea>())
      .values(),
  );

  return (
    <div className="absolute inset-0">
      {highlights.map((area, index) => {
        const severity = flaggedLineSeverities.get(area.lineNumber) ?? "solid";
        const isActive = activeLineNumber === area.lineNumber;
        const padX = isActive ? 0.006 : 0.004;
        const padY = isActive ? 0.003 : 0.002;
        const left = Math.max(0, area.left - padX);
        const top = Math.max(0, area.top - padY);
        const right = Math.min(1, area.left + area.width + padX);
        const bottom = Math.min(1, area.top + area.height + padY);

        return (
          <button
            type="button"
            key={`${area.lineNumber}-${index}`}
            aria-label={`Show feedback for resume line ${area.lineNumber}`}
            onClick={() => onHighlightSelect(area.lineNumber)}
            className={`absolute cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/60 ${severityClass(severity, isActive)}`}
            style={{
              height: `${(bottom - top) * 100}%`,
              left: `${left * 100}%`,
              top: `${top * 100}%`,
              width: `${(right - left) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function FeedbackItem({
  isActive,
  item,
  onRef,
  onSelect,
}: {
  isActive: boolean;
  item: Feedback;
  onRef: (element: HTMLElement | null) => void;
  onSelect: () => void;
}) {
  const severityTextClass =
    item.severity === "critical"
      ? "text-[oklch(var(--danger-ink))]"
      : item.severity === "improve"
        ? "text-[oklch(var(--warning-ink))]"
        : "text-[oklch(var(--info-ink))]";
  const severityBackgroundClass =
    item.severity === "critical"
      ? "bg-[oklch(var(--danger-bg))]"
      : item.severity === "improve"
        ? "bg-[oklch(var(--warning-bg))]"
        : "bg-[oklch(var(--info-bg))]";

  return (
    <article
      ref={onRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer border-b border-[oklch(var(--line))] px-4 py-3 text-left transition last:border-b-0 hover:brightness-[1.025] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/45 ${severityBackgroundClass} ${
        isActive ? "outline outline-1 -outline-offset-1 outline-[oklch(var(--ink))]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`text-xs font-semibold ${severityTextClass}`}>{severityLabel(item.severity)}</span>
        <span className="text-xs font-medium text-muted-foreground">line {item.lineNumber}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
      <div className="mt-2 border-l border-[oklch(var(--line-strong))] pl-3">
        <blockquote className="font-mono text-xs leading-5 text-[oklch(var(--quote))]">
          {item.line}
        </blockquote>
      </div>
      <p className="mt-3 text-base leading-7 text-[oklch(var(--ink))]">{item.detail}</p>
    </article>
  );
}

function NoDataEmptyState({
  description,
  imageSize,
  imageSrc,
  title,
}: {
  description: string;
  imageSize: "sm" | "md";
  imageSrc: string;
  title: string;
}) {
  const imageClassName = imageSize === "sm" ? "mb-5 h-auto w-28 opacity-80 sm:w-32" : "mb-5 h-auto w-40 opacity-80 sm:w-48";

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col items-center justify-center bg-white px-6 py-8 text-center lg:min-h-[calc(100vh-4rem)]">
      <Image
        src={imageSrc}
        alt=""
        width={220}
        height={215}
        loading="eager"
        priority
        className={imageClassName}
      />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
