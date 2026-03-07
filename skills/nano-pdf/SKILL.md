---
name: nano-pdf
description: Edit PDFs with natural-language instructions.
metadata: { "klaus": { "emoji": "📄", "requires": { "bins": ["nano-pdf"] }, "install": [{ "id": "uv", "kind": "uv", "package": "nano-pdf", "label": "Install nano-pdf (uv)" }] } }
---

# nano-pdf

Apply edits to PDF files using natural-language instructions.

## When to Use

- User wants to modify text in a PDF (change titles, fix typos, update content)
- User sends a PDF and asks for specific edits
- User wants to update a presentation deck or document

## Commands

### Edit a specific page

```bash
nano-pdf edit /path/to/document.pdf 1 "Change the title to 'Q3 Results' and fix the typo in the subtitle"
```

### Edit with output to different file

```bash
nano-pdf edit /path/to/input.pdf 1 "Update the date to March 2026" -o /tmp/output.pdf
```

## Workflow

1. Read the PDF first (use the Read tool) to understand the current content
2. Identify which page needs editing (pages may be 0-based or 1-based)
3. Run `nano-pdf edit` with a clear natural-language instruction
4. Verify the output by reading the resulting PDF
5. If the result looks off by one page, retry with the other page number convention

## Notes

- Page numbers may be 0-based or 1-based depending on version; try both if needed
- Always sanity-check the output PDF before sending it to the user
- For complex multi-page edits, run one command per page
- Output to `/tmp/` when modifying files to keep originals intact
