# Texas Rail Road Commission — Bare Scaffold

## Goal
Set up this project as "Texas Rail Road Commission" with a minimal starting point, ready for the user to sync to GitHub and continue development with Codex.

## Steps

1. **Replace the placeholder home page** (`src/routes/index.tsx`)
   - Remove the blank-page placeholder.
   - Render a minimal page: centered "Texas Rail Road Commission" heading with a short "coming soon" line, using existing design tokens (no custom colors).

2. **Update head metadata**
   - `src/routes/index.tsx`: add a `head()` with title "Texas Rail Road Commission", a unique description, `og:title`, `og:description`, `og:type`, and `twitter:card`. No `og:image` (no absolute image URL available).
   - `src/routes/__root.tsx`: replace the generic "Lovable App" / "Lovable Generated Project" title and description defaults with Texas Rail Road Commission values.

3. **Verify**
   - Check the build log for errors and confirm the home page renders the new heading.

## Out of scope
- No database, auth, or backend features.
- No additional pages or routes.
- GitHub connection: the user will connect it themselves via Plus (+) menu → GitHub → Connect project.

## Technical notes
- TanStack Start v1 project; home page lives at `src/routes/index.tsx`.
- Styling uses existing semantic tokens from `src/styles.css`; no new theme values needed.
