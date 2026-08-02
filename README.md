# Resume Reviewer

A local-first resume review tool that lets users upload a resume, inspect the rendered document, and get direct AI feedback by section and line.

The app is built for people who want practical, critical feedback before sending their resume to recruiters, hiring teams, or peers. It focuses on concrete issues: vague wording, missing metrics, weak action verbs, dense lines, and section-level patterns.

## Features

- Upload PDF, DOCX, plain text, Markdown, RTF, or CSV resumes.
- Parse resumes in the browser with no file storage.
- Generate direct Groq-backed feedback focused on hiring competitiveness, technical depth, ownership, impact, clarity, and ATS compatibility.
- Render uploaded resumes as document previews.
- Show a resume rating out of 100 and feedback grouped by resume section.
- Filter feedback by severity: Informative, Improve, and Critical.
- Click feedback to highlight the related resume text.
- Click highlighted resume text to scroll to and select the matching feedback.
- Keep inactive resume highlights neutral and selected highlights prominent.
- Show an animated loading state while the AI review is being generated.
- Download a PDF review report containing the rating, feedback summary, grouped findings, and resume preview pages.
- Warn users before they leave that the in-memory review will be lost, with an option to dismiss the warning.

## Privacy Model

Resume parsing happens locally in the browser session. The app sends extracted resume text to the server-side review endpoint so Groq can generate feedback, but it does not upload the original file or persist resume data. Closing or refreshing the tab clears the in-memory resume, review, and generated report state. Reviews are limited to 60,000 characters per request.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- shadcn/base-ui components
- PDF.js for PDF parsing and preview rendering
- Mammoth for DOCX text extraction
- Groq API for AI feedback
- jsPDF for downloadable PDF reports
- Vercel Analytics

## Getting Started

Install dependencies:

```bash
npm install
```

Configure the server-side Groq client in `.env.local`:

```bash
GROQ_API_KEY=your_api_key_here
```

`GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`.

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

PDF highlights use PDF text-position data where available. DOCX and text-based formats are rendered into generated page previews, so highlight placement follows the generated preview layout. RTF, CSV, Markdown, and plain text files are read as text and rendered into the generated preview layout.
