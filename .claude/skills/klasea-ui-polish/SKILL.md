---
name: klasea-ui-polish
description: Polish UI in the KlaseA production app with a premium, operational SaaS look while preserving existing React, theme tokens, Spanish copy, and inline style conventions.
---

# KlaseA UI Polish

Use this skill when improving existing KlaseA screens without changing product logic.

## Principles

- Keep operational density: the user needs fast scanning, not landing-page decoration.
- Prefer clear hierarchy: one primary title, compact metrics, visible search/actions, then data.
- Use the project theme tokens from `@/theme` and CSS variables (`var(--panel-solid)`, `var(--border)`, `var(--text)`, etc.).
- Keep styles inline unless the file already has local CSS in a `<style>` tag.
- Polish both light and dark mode. Avoid hardcoded black overlays that wash out light mode.
- Use subtle glassmorphism only as a support: `var(--panel-solid)`/`var(--topbar-soft)`, thin borders, soft shadows, and `backdropFilter`.
- Cards should have clear hover feedback: border lift, slight translate, shadow, and readable focus styles.
- Remove visual clutter before adding new visuals. A simpler, sharper layout is better than more widgets.

## Checklist

1. Reduce unnecessary vertical height in headers.
2. Move KPIs into compact chips or micro-cards.
3. Use responsive grids with stable row sizes.
4. Keep interactive targets obvious and reachable.
5. Run `npx eslint <touched files>` and `npm run build`.
