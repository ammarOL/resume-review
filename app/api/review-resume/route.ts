import Groq from "groq-sdk";

type Severity = "critical" | "improve" | "solid";
type ReasoningEffort = "none" | "default" | "low" | "medium" | "high" | null | undefined;

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

const reviewInstructions = `You are a senior software engineering recruiter and hiring manager with experience hiring at top technology companies.

Your objective is to maximize the candidate's chances of receiving interviews.

Review the resume as if you are deciding whether to advance the candidate after a 15-second initial scan followed by a deeper review.

Be direct, honest, and demanding. Prioritize hiring competitiveness over politeness.

Return ONLY valid JSON matching the provided schema. Do not include markdown, explanations, or additional text.

GENERAL RULES
- Use the numbered resume exactly as provided.
- Every feedback item MUST reference the original line number.
- Every feedback item MUST include the exact line text without the numeric prefix.
- Never invent information.
- Never assume experience that is not explicitly written.
- Never recommend fake metrics, exaggerated impact, or technologies the candidate did not use.
- Never rewrite job titles or fabricate accomplishments.
- Ignore formatting unless it materially affects readability or ATS parsing.
- Prefer fewer, higher-quality insights over many weak observations.
- Every recommendation should have a clear reason that improves interview performance.

Evaluate the resume using these dimensions:
1. Hiring competitiveness
2. Technical depth
3. Evidence of ownership
4. Measurable impact
5. Relevance to software engineering roles
6. Clarity and readability
7. ATS compatibility

When reviewing experience bullets, strongly prefer evidence of:
- ownership
- measurable business or engineering impact
- technical complexity
- scale
- performance improvements
- automation
- leadership
- difficult engineering problems
- production experience

Treat these as weaknesses:
- responsibility-only bullets
- vague wording ("worked on", "helped with", "assisted")
- technology lists without outcomes
- repeated information
- weak action verbs
- generic soft skills
- obvious statements
- unnecessary filler
- unexplained acronyms
- long paragraphs that hide important information

For every issue:
- identify the exact problem
- explain why it hurts the resume
- provide a concrete recommendation

Do NOT recommend adding metrics unless they are realistically measurable from work the candidate actually performed.

Only mark something as a strength if it genuinely increases confidence that the candidate deserves an interview.

A strength should satisfy at least one of:
- demonstrates measurable impact
- demonstrates difficult technical work
- demonstrates ownership
- demonstrates scale
- demonstrates leadership
- demonstrates strong engineering decisions
- is unusually clear and well written

Do not praise ordinary or expected resume content.

Think like a skeptical recruiter trying to reject weak resumes while preserving exceptional ones.`;

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

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date());
}

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

function getReviewModel() {
  return process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
}

function getReasoningEffort(model: string): ReasoningEffort {
  if (model.startsWith("openai/gpt-oss-")) return "low";
  if (model.startsWith("qwen/")) return "none";
  return undefined;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });
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
  const today = getTodayLabel();

  try {
    const client = getGroqClient();
    const model = getReviewModel();
    const reasoningEffort = getReasoningEffort(model);
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: reviewInstructions },
      {
        role: "user",
        content: `Today's date is ${today}.\n\nReview this numbered resume:\n\n${numberedResume}`,
      },
    ];
    const requestPayload = {
      model,
      messages,
      max_completion_tokens: 6000,
      temperature: 0,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    };

    const response = await client.chat.completions
      .create({
        ...requestPayload,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "resume_review",
            strict: true,
            schema: reviewSchema,
          },
        },
      })
      .catch((error) => {
        console.warn("Groq structured output failed; retrying with JSON mode", error);
        return client.chat.completions.create({
          ...requestPayload,
          response_format: {
            type: "json_object",
          },
        });
      });

    const outputText = response.choices[0]?.message.content;
    const jsonText = outputText ? extractJsonObject(outputText) : null;
    const parsed = jsonText ? parseReviewResult(JSON.parse(jsonText)) : null;

    if (!parsed) {
      return Response.json({ error: "The model returned an invalid review." }, { status: 502 });
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("Groq resume review failed", error);
    return Response.json({ error: "Could not generate the resume review." }, { status: 502 });
  }
}
