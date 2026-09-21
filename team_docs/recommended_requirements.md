# Recommended Product Requirements

Derived from [team_docs/competitive-landscape.md](competitive-landscape.md) (as of 2026-09-19)

**Method:** for each competitor category, strengths become "must have" requirements (so we match what already works) and weaknesses become "must avoid" requirements (so we don't inherit the same gaps). Consolidated at the bottom.

## Category 1: Async standup & status-update tools (Geekbot, DailyBot, Range)

**Must have**

- Must require minimal effort to submit an update (answerable in under 2 minutes)
- Must let people report from where they already work, not force a new app/tab
- Must be cheap/free to start for small teams

**Must avoid**

- Must not be limited to a daily-only cadence with no rollup into a real weekly narrative
- Must not let updates decay into unread noise (avoid pure notification-based digests)
- Must not leave reported activity disconnected from the actual work artifacts (commits, docs, tickets) that back it up

## Category 2: Git/activity-based auto-reporting tools (Gitmore, Steady)

**Must have**

- Must support automatic capture of work activity with zero manual effort where possible
- Must pull from objective, tamper-resistant source data, not just self-report
- Must remove the "nothing to report" awkwardness of a slow week

**Must avoid**

- Must not be limited to engineering/git-based work; must be usable by design, sales, support, ops, research, and any other profession
- Must not treat raw activity volume (commit/PR count) as a proxy for value or impact
- Must not omit room for human context, judgment, and a "why this mattered" narrative
- Must not reinforce an activity-tracking mindset (this is what we're moving away from)

## Category 3: Continuous performance & engagement platforms (15Five, Lattice)

**Must have**

- Must make the weekly check-in a core, first-class loop, not a bolted-on feature
- Must roll updates up naturally into reviews, 1:1s, recognition, and trend visibility
- Must be enterprise-credible where needed (security, SSO, integrations) without requiring it

**Must avoid**

- Must not be priced or positioned as heavyweight HR/performance-management software
- Must not frame the product primarily around engagement/review cycles instead of day-to-day operational visibility into what got done
- Must not require heavy setup/admin overhead (templates, cycles, question banks) that undermines "just submit a quick report" simplicity
- Must not skew toward manager-employee-only visibility; must support team-wide, peer-visible contribution logs

## Category 4: OKR/goal-tracking platforms (Viva Goals, Quantive)

**Must have**

- Must let contributions tie back to company/team-level strategy when relevant ("this moved KR3") as an optional layer
- Must support integration with existing PM tools to pull progress signals automatically

**Must avoid**

- Must not make weekly reporting a thin, optional afterthought to a quarterly cadence
- Must not require heavy upfront setup (goal definition/cascading) before the product delivers value
- Must not leave unstructured or ad hoc work (support tickets, maintenance, firefighting) with nowhere to go because it doesn't map to a formal goal
- Must not be aimed only at strategic alignment at the expense of being a genuine timesheet/status replacement

## Category 5: Legacy hourly time-tracking tools (Toggl, Harvest, Hubstaff, Clockify)

**Must have**

- Must provide a simple, unambiguous, auditable/exportable unit of record where billing or payroll requires it
- Must offer an answer for teams that legally or contractually must report hours (client services, agencies, government contracts), even if this isn't the core loop

**Must avoid**

- Must not measure presence/time-spent as the primary signal of value created
- Must not function as (or be perceived as) a surveillance/micromanagement tool
- Must not stay silent on outcomes, blockers, or what actually shipped
- Must not force hours-based tracking onto salaried, outcome-based, or creative work where hours don't map to value

## Category 6: DIY/generic tools (Notion, Google Docs/Sheets, Confluence)

**Must have**

- Must be low/no-cost and require no new procurement or security review to start
- Must be flexible enough to fit a team's exact fields/workflow
- Must produce a fully searchable history

**Must avoid**

- Must not rely on manual chasing to keep submission rates up; must include reminders/nudges
- Must not let format and fields drift into inconsistency over time; must enforce structure
- Must not require someone to manually build and maintain rollups, trends, or manager-facing views
- Must not require pure manual re-typing of work that already exists in other tools (git, tickets, CRM)

## Category 7: Project-management tools repurposed for status (Jira, Linear, Asana)

**Must have**

- Must surface rich work-item context (linked tickets, PRs, history) automatically where it already exists
- Must work well for teams with high existing PM-tool penetration by integrating with those tools rather than replacing them

**Must avoid**

- Must not require manual dashboard-building or third-party add-ons to get a readable weekly narrative
- Must not be ticket-centric only; must capture untracked work (mentoring, hiring, cross-team support, ad hoc firefighting)
- Must not be engineering-only; must have first-class coverage for non-technical teams (sales, marketing, ops, support)
- Must not be purely passive data that someone has to go dig out; must have an active, habit-forming submission ritual

## Consolidated requirements (cross-category patterns)

### Must have (do well)

1. **Minimal effort to use** — submittable in a couple of minutes, ideally auto-populated from existing work data (git, tickets, CRM) rather than retyped.
2. **Cross-functional / widely usable** — must work equally well for engineering, design, sales, support, ops, and research, not just git-based roles.
3. **Weekly narrative as the primary artifact** — a coherent, human-readable account of what happened and why it mattered, not just a byproduct of raw activity logs.
4. **Structure that holds up over time** — consistent fields/format enforced by the product, not left to drift like a shared doc.
5. **Automatic reminders/nudges** to prevent submission decay.
6. **Rollups, trends, and manager/peer-visible views** generated automatically.
7. **Captures untracked/ad hoc work** (mentoring, firefighting, hiring, cross-team help), not just ticketed or committed work.
8. **Optional linkage to broader goals/OKRs**, without requiring them to be set up first.
9. **Low-friction adoption** — cheap or free to start, no heavy procurement, security review, or admin setup required to get value.
10. **An honest, auditable answer for billing/payroll/contractual hourly-reporting needs**, even if it isn't the product's core loop.

### Must avoid (do not repeat competitors' gaps)

1. Do not gate the product on engineering-only data sources (e.g., git activity alone).
2. Do not equate raw activity volume (commits, tickets closed, hours logged) with value or impact.
3. Do not omit space for human context and judgment ("why this mattered").
4. Do not require heavy setup (goal cascades, question banks, templates) before the product is useful.
5. Do not price or position the product as enterprise HR/performance-management software by default.
6. Do not let the weekly report become a passive artifact someone has to dig out of a dashboard.
7. Do not create a surveillance/micromanagement perception (presence-tracking, time theater).
8. Do not default to a daily or quarterly cadence when weekly is the core value prop.
9. Do not leave rollups/trends/history as something a team has to build and maintain themselves.
10. Do not ignore the billing/payroll edge case and assume it can be solved later.

## Positioning north star

From [team_docs/competitive-landscape.md](competitive-landscape.md): the product must be simultaneously **cross-functional**, **lightweight to adopt**, **structured enough to roll up into real reviews/trends**, and **honest about the billing/payroll edge case**. No current competitor holds all four at once — this combination is the whitespace to build into.

## Final summary

1. Auto-populate updates from existing work data (git, tickets, CRM) — submittable in minutes, not retyped from scratch.
2. Work equally well across all functions (engineering, design, sales, support, ops, research), not just git-based roles.
3. Center the weekly narrative — a human-readable "what happened and why it mattered," not raw activity counts.
4. Enforce consistent structure/fields over time instead of letting format drift.
5. Send automatic reminders/nudges to prevent submission decay.
6. Auto-generate rollups, trends, and manager/peer-visible views.
7. Capture untracked/ad hoc work (mentoring, firefighting, hiring, cross-team help), not just ticketed work.
8. Allow optional linkage to OKRs/company goals without requiring goal setup first.
9. Stay cheap and low-friction to adopt — no heavy procurement, security review, or admin setup.
10. Provide an honest, auditable answer for billing/payroll/hourly-reporting needs as a secondary capability, not the core loop.
11. Never equate raw activity volume (commits, tickets, hours) with value, and never feel like surveillance/time theater.
