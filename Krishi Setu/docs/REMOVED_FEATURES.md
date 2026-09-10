# Krishi Setu — Intentionally Removed / Not-Shipped Items

> Recreated during the final project cleanup (the original copy was missing
> from the workspace). Only items that can be verified from the current
> codebase are listed. If the original file contained additional items, they
> are lost and should be re-added here when remembered.

This file records capabilities that were deliberately **not** included in the
final product, so reviewers do not mistake their absence for bugs.

## Consolidated governance persona (Admin → Supervisor)

The final build ships **one** governance persona: **Supervisor**.
Legacy "Admin" routes, labels and any admin-mode links resolve to the
Supervisor workspace (`demoLogin()` maps `admin` → `supervisor`, and
`loginAccount()` does the same). There is no separate Admin dashboard in
this build.

## Demo session persistence across reload

The one-click demo login (`demoLogin`) is a session **in memory** for
demonstration convenience — it does not survive a page reload by design.
Real Supabase sessions do persist (restored by `bootstrapSupabaseSession`).
This keeps the demo honest: only real authentication survives a refresh.

## Redundant desktop/mobile UI controls

- The desktop-only logout button and the "Switch to Buyer View" button are
  hidden in the mobile layout; the mobile tab bar and persona segmented
  control replace them (both still call the same handlers).
- The floating theme button (`#themeFab`) is shown only on the login screen;
  the top-bar theme toggle covers the rest of the app.

## Offline market feed

When the live government price feed is not configured (no API key / offline),
the app shows clearly labelled reference rows instead of pretending the data
is live. No fake "live" claims are made.

## Removed / archived development artifacts

Pre-final screenshots, one-off screenshot scripts and the orphaned
`ks-2026-design.css` source (its styles were inlined into the main HTML)
live in `archive/legacy-tools/` — they are not part of the product.