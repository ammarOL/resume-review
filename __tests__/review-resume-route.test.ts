import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createMock = vi.fn();

vi.mock("groq-sdk", () => ({
  default: vi.fn(
    function Groq() {
      return {
        chat: {
          completions: {
            create: createMock,
          },
        },
      };
    },
  ),
}));

async function postResume(resumeText: string) {
  const { POST } = await import("@/app/api/review-resume/route");

  return POST(
    new Request("http://localhost/api/review-resume", {
      method: "POST",
      body: JSON.stringify({ resumeText }),
    }),
  );
}

describe("POST /api/review-resume", () => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.GROQ_MODEL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.GROQ_API_KEY = originalApiKey;
    process.env.GROQ_MODEL = originalModel;
  });

  test("returns structured model feedback and defaults to Groq GPT OSS", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              feedback: [
                {
                  id: "line-1",
                  section: "Summary",
                  lineNumber: 1,
                  line: "Responsible for various projects.",
                  severity: "critical",
                  title: "Weak wording",
                  detail: "Replace responsibility language with a specific result.",
                },
              ],
              sections: [{ name: "Summary", lineCount: 1, issues: 1, critical: 1 }],
              stats: { lines: 1, sections: 1, issues: 99, critical: 99, score: 64 },
            }),
          },
        },
      ],
    });

    const response = await postResume("Responsible for various projects.");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-oss-20b",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Today's date is July 27, 2026."),
          }),
        ]),
      }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("1: Responsible for various projects."),
          }),
        ]),
      }),
    );
    expect(body.feedback).toHaveLength(1);
    expect(body.stats).toMatchObject({ issues: 1, critical: 1, score: 64 });
  });

  test("uses GROQ_MODEL when configured", async () => {
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              feedback: [],
              sections: [],
              stats: { lines: 0, sections: 0, issues: 0, critical: 0, score: 100 },
            }),
          },
        },
      ],
    });

    const response = await postResume("React, TypeScript");

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: "llama-3.3-70b-versatile" }));
  });

  test("falls back to JSON mode when structured output is rejected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createMock.mockRejectedValueOnce(new Error("schema is not supported"));
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              feedback: [],
              sections: [],
              stats: { lines: 0, sections: 0, issues: 0, critical: 0, score: 100 },
            }),
          },
        },
      ],
    });

    const response = await postResume("React, TypeScript");

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        response_format: { type: "json_object" },
      }),
    );
  });

  test("rejects empty resume text", async () => {
    const response = await postResume("   ");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Resume text is required.");
    expect(createMock).not.toHaveBeenCalled();
  });
});
