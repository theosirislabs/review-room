# Known traps

Failures that have actually happened, with the signal that reveals them and the fix.

## 1. The client surface renders inside the agency shell

**Signal.** White-on-white text, invisible captions, or wrong-contrast surfaces in the client portal *only* in staff preview, while the public share link looks fine.

**Cause.** Staff preview mounts `.rr-client` inside `.rr-agency` while the document carries `data-theme="dark"`. Any global agency selector such as `[data-theme=dark] .rr-agency .text-zinc-950` matches the nested client markup, so the client's own `data-client-theme="light"` is overridden.

**Fix.** Scope client tokens by their own attribute with enough specificity to win:

```css
.rr-client[data-client-theme="light"] .text-zinc-950 { color: #09090b; }
```

Keep the light and dark token blocks symmetric; every `dark` rule needs a `light` counterpart or the regression returns on the other theme.

## 2. A month with no posts is not a bug

**Signal.** Calendar shows an empty grid and a "0 scheduled" metric.

**Cause.** Seeded and real content often sits in an older month than today.

**Fix.** Never silently treat an empty month as a rendering failure. Report the dated-item count for the active filters, and offer an explicit jump action. Label it by what it actually does: "next" when an upcoming item exists, "earliest" when everything has passed. Wrong labels read as broken UX.

## 3. Fixed overlays hide on small screens, not everywhere

**Signal.** A floating pill (sync, load, quick actions) sits on top of content or a button at mobile widths.

**Fix.** Fixed overlays cannot coexist with short content. Gate them with `hidden ... sm:flex` rather than nudging positions, and check the client action bar, preview exit bar, and approval bar for the same collision. Accept that an informational badge disappears on mobile; do not accept overlap.

## 4. Minified CSS breaks verification greps

**Signal.** A deployed-asset check reports a rule is missing when it is definitely in the source.

**Cause.** The minifier strips quotes from attribute values, so `[data-client-theme="light"]` ships as `[data-client-theme=light]`.

**Fix.** Match both forms, and check the image's `dist` before concluding anything. Confirm the served filenames in `index.html` match the image's assets, otherwise the browser is cached or the router is serving another container.

## 5. Gated surfaces cannot be verified in production

**Signal.** `/agency/*` renders a login or an empty shell, `/client/*` renders "SECURE PROTOCOL TERMINATED".

**Cause.** Those routes need a session, an admin token, or a share token.

**Fix.** Verify them on the local dev build against seeded data. In production, verify reachability, health, auth enforcement, and the built assets. Do not go looking in production storage for a token to make a check pass.

## 6. Backing up the data directory is not a code-deploy step

**Signal.** A `tar` of `data/` runs for many minutes and may time out mid-copy.

**Cause.** `data/` holds the SQLite database plus uploads and is around 15G.

**Fix.** `git bundle` for source plus `sqlite3 data/osiris.db ".backup ..."` for the database. Add media only when the change touches uploads or storage, and disclose it.

## 7. Probe routes that exist, or the check is meaningless

**Signal.** An unauth mutation probe returns 404 and gets read as "auth works".

**Cause.** The path does not exist. `/api/posts/:id` accepts `PATCH` only where the route is `DELETE`, for example.

**Fix.** Enumerate real mutating routes from `server.ts` (`app.post|patch|put|delete`) and expect 401 or 403 from each.

## 8. Pull on production only when the tree is clean

**Signal.** `git pull` refuses, or production behavior changes after a pull that was supposed to be a no-op.

**Cause.** Live-only edits in the checkout.

**Fix.** `git status --short` first. Reconcile by hand — commit and push the live change, or move it aside — never `reset --hard` and never force-push.

## 9. Mid-edit hot reload produces phantom runtime errors

**Signal.** A `ReferenceError` or blank view in the browser that disappears without any change.

**Cause.** Vite hot-swapped a partially written module.

**Fix.** Reload before investigating, and confirm against the built bundle (`npm run build` plus a grep in `dist`) rather than the dev console alone.

## 10. Incidental indirection and stale artifacts

**Signal.** A path that "does not exist" for an existing repo, or a container nobody recognizes.

**Cause.** Typos when retyping environment values, and leftover scratch containers from earlier deploys.

**Fix.** Copy anchors from the skill or discover them with the discovery block; never retype from memory. List non-serving containers during housekeeping and remove abandoned ones with the owner's knowledge.
