import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import ResumeReviewer from "@/app/resume-reviewer";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

test("renders the resume reviewer work surface", () => {
  render(<ResumeReviewer />);

  expect(screen.getByRole("heading", { level: 1, name: "Resume Reviewer" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Add resume" })).toBeDefined();
  expect(screen.getByText("No resume loaded")).toBeDefined();
  expect(screen.getByText("No feedback yet")).toBeDefined();
});
