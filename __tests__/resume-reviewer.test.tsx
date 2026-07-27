import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import ResumeReviewer from "@/app/resume-reviewer";

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
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  expect(screen.getByText("No resume loaded")).toBeDefined();
  expect(screen.getByText("No feedback yet")).toBeDefined();
});

test("keeps the severity filter active after selecting feedback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("AI unavailable")));
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ResumeReviewer />);

  fireEvent.click(screen.getByRole("button", { name: "Add resume" }));
  fireEvent.click(screen.getByRole("button", { name: "Try sample" }));

  let improveFilter: HTMLElement | undefined;

  await waitFor(() => {
    improveFilter = screen
      .getAllByRole("button")
      .find((button) => /^Improve\s*\(\d+\)$/.test(button.textContent ?? ""));
    expect(improveFilter).toBeDefined();
  });

  expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
  expect(screen.getByLabelText(/Resume rating \d+ out of 100/)).toBeDefined();

  if (!improveFilter) throw new Error("Improve filter was not found.");
  fireEvent.click(improveFilter);
  const feedbackItem = screen
    .getAllByRole("button")
    .find((button) => button.textContent?.includes("Bullet starts softly"));

  if (!feedbackItem) throw new Error("Feedback item was not found.");
  fireEvent.click(feedbackItem);

  expect(improveFilter.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Show all" })).toBeDefined();
  expect(screen.queryByText("Weak or generic wording")).toBeNull();
});
