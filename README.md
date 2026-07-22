# Resume Reviewer

A local-first resume review tool that lets users upload a resume, inspect the rendered document, and get direct feedback by section and line.

The app is built for people who want practical, critical feedback before sending their resume to recruiters, hiring teams, or peers. It focuses on concrete issues: vague wording, missing metrics, weak action verbs, dense lines, and section-level patterns.

## Features

- Upload PDF, DOCX, plain text, Markdown, RTF, or CSV resumes.
- Parse resumes in the browser with no file storage.
- Render uploaded resumes as document previews.
- Show feedback grouped by resume section.
- Filter feedback by severity: Informative, Improve, and Critical.
- Click feedback to highlight the related resume text.
- Click highlighted resume text to scroll to and select the matching feedback.
- Keep inactive resume highlights neutral and selected highlights prominent.

## Privacy Model

Resume parsing happens locally in the browser session. The app does not upload resume files to a server and does not persist resume data. Closing the tab clears the in-memory state.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- shadcn/base-ui components
- PDF.js for PDF parsing and preview rendering
- Mammoth for DOCX text extraction

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Notes

PDF highlights use PDF text-position data where available. DOCX and text-based formats are rendered into generated page previews, so highlight placement follows the generated preview layout.
