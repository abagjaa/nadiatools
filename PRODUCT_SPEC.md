# Nadia's Tools - Product Specification

## Users and access

- Developer: Agus Bagja. Full access, manages passwords, Gemini configuration, tool access, reports, and statistics.
- Primary user: Nadia. Full access to all tools.
- Team member: access to individual tools is controlled only by Developer.
- Login uses one unique password per person; identity is inferred server-side from the password.

## Product surfaces

- Public home page: concise introduction, visual workflow, and login entry.
- Secure dashboard: tools, job history, notifications, feedback, and settings.
- Developer area: aggregate statistics, user activity, Gemini usage/failures, permissions, password management, and bug reports.
- Light and dark themes, Indonesian language, responsive Chrome-first UI, future PWA support.

## Shared job flow

1. Upload PDF, folder, ZIP, Excel, or capture a photo on mobile.
2. Read digital PDF text directly. Use Gemini only for scans/photos or uncertain extraction.
3. Keep long-running jobs active in the background, with progress, notification, cancel, and retry-failed-only actions.
4. Always show a review and confirmation step before download.
5. Delete source and generated files after 24 hours. Retain aggregate statistics without document content.

## Tools in priority order

### 1. Split PDF

- Split every page or user-defined visual ranges.
- Naming and review flow compatible with Rename PDF.
- Download individually, to a supported browser folder, or as ZIP.

### 2. Rename PDF

- Accept one/many PDFs, folders, or ZIP; digital and scanned PDFs.
- Visual drag-and-drop filename pattern builder.
- Default: `Nomor Sertifikat SLO_Nama Pemilik.pdf`.
- Handle duplicate names, unreadable documents, and low-confidence results through review.

### 3. Merge PDF

- Merge all uploaded files into exactly one PDF.
- Thumbnail review with drag reorder, rotate, and delete-page actions.

### 4. SLO & NIDI Extractor

- Inputs: blank Excel template plus SLO PDFs from one file, folder, or ZIP.
- Extract name, SLO certificate number, and NIDI.
- Match names case-insensitively and ignore punctuation/extra whitespace.
- Small differences are suggestions requiring confirmation.
- Output choice: create a new workbook or fill the uploaded template.
- Review supports editing, rematching, document preview, skip, duplicate/missing/low-confidence warnings, and adding unmatched names as new rows.

## Feedback

- Type, explanation, pasted screenshot (with Windows + Shift + S guidance), and urgency.
- Developer workflow: New, In review, Complete, with in-app responses and notifications.

## Pending production inputs

- Blank Excel template and representative correct output.
- Gemini API key configured as a server secret (never exposed to clients).
- Initial passwords set through a secure deployment/setup flow.
