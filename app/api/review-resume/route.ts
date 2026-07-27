import OpenAI from "openai";

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

type ReviewResult = {
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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["feedback", "sections", "stats"],
  properties: {
    feedback: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "section", "lineNumber", "line", "severity", "title", "detail"],
        properties: {
          id: { type: "string" },
          section: { type: "string" },
          lineNumber: { type: "integer", minimum: 1 },
          line: { type: "string" },
          severity: { type: "string", enum: ["critical", "improve", "solid"] },
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "lineCount", "issues", "critical"],
        properties: {
          name: { type: "string" },
          lineCount: { type: "integer", minimum: 0 },
          issues: { type: "integer", minimum: 0 },
          critical: { type: "integer", minimum: 0 },
        },
      },
    },
    stats: {
      type: "object",
      additionalProperties: false,
      required: ["lines", "sections", "issues", "critical", "score"],
      properties: {
        lines: { type: "integer", minimum: 0 },
        sections: { type: "integer", minimum: 0 },
        issues: { type: "integer", minimum: 0 },
        critical: { type: "integer", minimum: 0 },
        score: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
  },
} as const;

function isSeverity(value: unknown): value is Severity {
  return value === "critical" || value === "improve" || value === "solid";
}

function parseReviewResult(value: unknown): ReviewResult | null {
  if (!value || typeof value !== "object") return null;

  const result = value as Partial<ReviewResult>;
  if (!Array.isArray(result.feedback) || !Array.isArray(result.sections) || !result.stats) {
    return null;
  }

  const feedback = result.feedback
    .filter((item): item is Feedback => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<Feedback>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.section === "string" &&
        typeof candidate.lineNumber === "number" &&
        Number.isInteger(candidate.lineNumber) &&
        typeof candidate.line === "string" &&
        isSeverity(candidate.severity) &&
        typeof candidate.title === "string" &&
        typeof candidate.detail === "string"
      );
    })
    .slice(0, 24);

  const sections = result.sections.filter((item): item is SectionSummary => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<SectionSummary>;

    return (
      typeof candidate.name === "string" &&
      typeof candidate.lineCount === "number" &&
      typeof candidate.issues === "number" &&
      typeof candidate.critical === "number"
    );
  });

  const stats = result.stats as Partial<ReviewResult["stats"]>;
  if (
    typeof stats.lines !== "number" ||
    typeof stats.sections !== "number" ||
    typeof stats.issues !== "number" ||
    typeof stats.critical !== "number" ||
    typeof stats.score !== "number"
  ) {
    return null;
  }

  return {
    feedback,
    sections,
    stats: {
      lines: Math.max(0, Math.round(stats.lines)),
      sections: Math.max(0, Math.round(stats.sections)),
      issues: feedback.length,
      critical: feedback.filter((item) => item.severity === "critical").length,
      score: Math.max(0, Math.min(100, Math.round(stats.score))),
    },
  };
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { resumeText?: unknown } | null;
  const resumeText = typeof body?.resumeText === "string" ? body.resumeText.trim() : "";

  if (!resumeText) {
    return Response.json({ error: "Resume text is required." }, { status: 400 });
  }

  if (resumeText.length > 60000) {
    return Response.json({ error: "Resume text is too long to review in one pass." }, { status: 413 });
  }

  const numberedResume = resumeText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.1",
      instructions:
        "You are a direct, exacting resume editor. Review the resume for hiring competitiveness. Return only JSON that matches the schema. Use line numbers from the numbered resume exactly. Every feedback item must cite the exact line text from the resume without the numeric prefix. Prefer concrete, critical feedback over generic praise. Include solid items only for genuinely strong lines worth preserving.",
      input: `Review this numbered resume:\n\n${numberedResume}`,
      max_output_tokens: 3600,
      text: {
        format: {
          type: "json_schema",
          name: "resume_review",
          strict: true,
          schema: reviewSchema,
        },
      },
    });

    const parsed = parseReviewResult(JSON.parse(response.output_text));

    if (!parsed) {
      return Response.json({ error: "The model returned an invalid review." }, { status: 502 });
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("OpenAI resume review failed", error);
    return Response.json({ error: "Could not generate the resume review." }, { status: 502 });
  }
}
