# OVAL LinkedIn Visual Reference

## Purpose

This document records the current LinkedIn Intelligence page as a visual and interaction reference. Use it when aligning another OVAL source page with the same evidence-first dashboard feel.

Source implementation: `oval/src/app/linkedin/page.tsx`

## Visual character

- Premium public-reputation intelligence view.
- Dark navy and LinkedIn-blue executive briefing at the top.
- Pale slate and blue page background in light mode.
- White surface cards with soft slate borders and low-elevation shadows.
- Compact, readable evidence cards rather than dense tables by default.
- Evidence can be opened into a focused detail modal.

## Page hierarchy

1. Executive sentiment briefing
2. Filter panel
3. Four KPI cards
4. Latest detected evidence for the recent period
5. Filtered evidence list with pagination
6. Evidence detail modal

## Colour reference

| Role | Current treatment |
|---|---|
| Page background | Pale slate-to-blue vertical gradient |
| Executive hero | Dark navy to LinkedIn blue diagonal gradient |
| Primary source accent | LinkedIn blue: `#0a66c2` |
| Positive signal | Emerald |
| Neutral signal | Slate grey |
| Critical signal | Red |
| Surface | White in light mode; slate in dark mode |
| Border | Light slate border |

## Typography

- Executive headline: 24px on small screens, 36px on desktop; semibold.
- Section headings: 18px; bold.
- Evidence title: 14px; bold.
- Evidence body and AI summary: 12px with relaxed line height.
- Metadata and badges: 10–11px; semibold or bold, uppercase only for labels.

## Components

### 1. Executive briefing

Shows a one-line overall sentiment statement, supporting counts, a three-way sentiment bar, and the leading critical theme.

Required data:

- Total posts analysed
- Positive, neutral, and critical counts
- Critical percentage
- Leading theme

### 2. Filter panel

The current page uses four compact controls:

- Time range
- Sentiment
- Critical category
- Sort order

It also includes an author/content search field. Changing a filter resets pagination.

### 3. KPI cards

Four equal cards in a two-column mobile grid and four-column desktop grid:

- Posts analysed
- Critical posts
- Critical percentage
- Positive posts

Each card has a primary value and compact uppercase label.

### 4. Latest-detected evidence

This uses a lightly tinted blue surface and displays a small selection of recent posts. Each item has:

- Sentiment badge
- Post title
- AI summary
- Public author name
- Publication date

Clicking an item opens the evidence detail modal.

### 5. Evidence list

Each evidence row includes:

- Number/rank marker
- Sentiment and issue-category badges
- Original post title
- Clearly labelled AI summary
- Public author context
- Published date
- Source indicator

Rows are clickable and open the detail modal. Pagination appears only when required.

### 6. Evidence detail modal

Desktop: centred modal. Mobile: bottom sheet.

It separates AI-generated interpretation from original evidence:

1. Sentiment and category labels
2. Post title and public author/date/source metadata
3. AI summary in a distinct tinted summary block
4. Original post content in a separate neutral surface
5. External source link when available

## Interaction rules

- Filters update the evidence list and KPI calculations for the selected range.
- Search matches post title, text, author, and summary.
- Evidence remains public-only: no private LinkedIn attributes or inferred identity data.
- Modal closes through its close control or backdrop click.
- Pagination controls are disabled at the first and final page.

## Responsive behaviour

- KPI cards: 2 columns on small screens, 4 columns from medium widths.
- Filters: stacked on smaller screens; multi-column on wider screens.
- Latest evidence: 1 column on small screens, 2 columns from medium widths.
- Modal: full-width bottom sheet on mobile, constrained centred dialog on desktop.

## Reuse guidance

When reusing this for Play Store, Reddit, or YouTube, keep the hierarchy and evidence interaction pattern but replace source-specific colour, metadata, and vocabulary:

| Source | Evidence | Primary metadata |
|---|---|---|
| Play Store | Review | Rating, app version, device, date |
| Reddit | Post/comment | Subreddit, author handle, engagement, thread depth |
| YouTube | Comment/transcript/video | Channel, video, timestamp, owned state |

Do not copy LinkedIn-specific labels, public-profile fields, or the `#0a66c2` source colour into another platform. Use each source's contextual information while retaining the same hierarchy: summary, filters, KPIs, recent evidence, list, and drill-down.
