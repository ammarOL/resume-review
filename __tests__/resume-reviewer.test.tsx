import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import ResumeReviewer from "@/app/resume-reviewer";

const savePdfMock = vi.fn();

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(
    function JsPDF() {
      return {
        addImage: vi.fn(),
        addPage: vi.fn(),
        getNumberOfPages: () => 1,
        getTextWidth: (text: string) => text.length * 4,
        internal: {
          pageSize: {
            getHeight: () => 792,
            getWidth: () => 612,
          },
        },
        line: vi.fn(),
        rect: vi.fn(),
        save: savePdfMock,
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        setPage: vi.fn(),
        setProperties: vi.fn(),
        setTextColor: vi.fn(),
        splitTextToSize: (text: string) => [text],
        text: vi.fn(),
      };
    },
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { alt, unoptimized, ...imageProps } = props;
    void unoptimized;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} {...imageProps} />
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("renders the resume reviewer work surface", () => {
  render(<ResumeReviewer />);

  expect(screen.getByRole("heading", { level: 1, name: "Resume Reviewer" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Add resume" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  expect(screen.getByText("No resume loaded")).toBeDefined();
  expect(screen.getByText("No feedback yet")).toBeDefined();
});

test("keeps the severity filter active after selecting feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feedback: [
          {
            id: "line-1",
            section: "Summary",
            lineNumber: 1,
            line: "Responsible for various projects.",
            severity: "critical",
            title: "Weak or generic wording",
            detail: "Replace vague responsibility language with a specific result.",
          },
          {
            id: "line-2",
            section: "Experience",
            lineNumber: 2,
            line: "- Worked on dashboards.",
            severity: "improve",
            title: "Bullet starts softly",
            detail: "Start with a stronger action verb.",
          },
        ],
        sections: [{ name: "Experience", lineCount: 1, issues: 1, critical: 0 }],
        stats: { lines: 2, sections: 2, issues: 2, critical: 1, score: 72 },
      }),
    }),
  );
  const { container } = render(<ResumeReviewer />);

  fireEvent.click(screen.getByRole("button", { name: "Add resume" }));
  expect(screen.queryByRole("button", { name: "Try sample" })).toBeNull();

  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("Resume file input was not found.");

  fireEvent.change(input, {
    target: {
      files: [
        new File(["Responsible for various projects.\n- Worked on dashboards."], "resume.txt", {
          type: "text/plain",
        }),
      ],
    },
  });

  let improveFilter: HTMLElement | undefined;

  await waitFor(() => {
    improveFilter = screen
      .getAllByRole("button")
      .find((button) => /^Improve\s*\([1-9]\d*\)$/.test(button.textContent ?? ""));
    expect(improveFilter).toBeDefined();
  });

  expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
  expect(screen.getByText("Download before leaving")).toBeDefined();
  expect(screen.getByText(/Closing or refreshing the tab will delete/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss data warning" }));
  await waitFor(() => {
    expect(screen.queryByText("Download before leaving")).toBeNull();
  });

  fireEvent.click(screen.getByRole("button", { name: "Download report" }));
  await waitFor(() => {
    expect(savePdfMock).toHaveBeenCalledWith("resume-review-report.pdf");
  });
  expect(container.querySelector('[aria-label="Resume rating 72 out of 100"]')).toBeDefined();

  if (!improveFilter) throw new Error("Improve filter was not found.");
  fireEvent.click(improveFilter);
  let feedbackItem: HTMLElement | undefined;

  await waitFor(() => {
    feedbackItem = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Bullet starts softly"));
    expect(feedbackItem).toBeDefined();
  });

  if (!feedbackItem) throw new Error("Feedback item was not found.");
  fireEvent.click(feedbackItem);

  expect(improveFilter.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Show all" })).toBeDefined();
  expect(screen.queryByText("Weak or generic wording")).toBeNull();
});
