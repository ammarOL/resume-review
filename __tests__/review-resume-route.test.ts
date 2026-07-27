import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(
    function OpenAI() {
      return {
        responses: {
          create: createMock,
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
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.OPENAI_MODEL = originalModel;
  });

  test("returns structured model feedback and defaults to GPT-5.1", async () => {
    createMock.mockResolvedValueOnce({
      output_text: JSON.stringify({
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
    });

    const response = await postResume("Responsible for various projects.");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.1",
        input: expect.stringContaining("1: Responsible for various projects."),
      }),
    );
    expect(body.feedback).toHaveLength(1);
    expect(body.stats).toMatchObject({ issues: 1, critical: 1, score: 64 });
  });

  test("uses OPENAI_MODEL when configured", async () => {
    process.env.OPENAI_MODEL = "gpt-5.1-mini";
    createMock.mockResolvedValueOnce({
      output_text: JSON.stringify({
        feedback: [],
        sections: [],
        stats: { lines: 0, sections: 0, issues: 0, critical: 0, score: 100 },
      }),
    });

    const response = await postResume("React, TypeScript");

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.1-mini" }));
  });

  test("rejects empty resume text", async () => {
    const response = await postResume("   ");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Resume text is required.");
    expect(createMock).not.toHaveBeenCalled();
  });
});
