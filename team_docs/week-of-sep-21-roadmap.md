# Week of Sep 21 Roadmap

_As of 2026-09-19_

## Overview

This week has two hard deliverables — a working sign-up/sign-in + daily reporting flow, and outreach to early adopters for a pilot meeting — plus a handful of things that are easy to skip but will bite you if you don't do them before those meetings happen: a pitch you can send after a good conversation, questions that actually validate the problem, and a way to track who you've talked to. The plan below sequences all of it across the week.

## Track A: Ship sign-up, sign-in, and daily reporting

| Day | Task                                                                                                     | Status      |
| --- | -------------------------------------------------------------------------------------------------------- | ----------- |
| Mon | Confirm Supabase auth provider (email/password or magic link) and env vars are correctly wired on Vercel | Complete    |
| Mon | Build/fix sign-up and sign-in pages, session handling, and protected routes                              | Complete    |
| Tue | Build the daily report submission form (what you did, blockers, links)                                   | Not started |
| Tue | Create Supabase table for reports tied to user id; set Row Level Security policies                       | Not started |
| Wed | Build a simple "my reports" view so a user can see their own history                                     | Not started |
| Wed | Deploy and smoke-test the full flow end to end with a throwaway test account                             | Not started |
| Wed | Fix auth/redirect/RLS bugs found in testing                                                              | Not started |

Goal by Wednesday night: a stranger can sign up, sign in, and submit a report without you walking them through it.

## Track B: Build early adopter lists

| Day | Task                                                                                                               | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| Mon | DAO list: pull top contributor-heavy DAOs from DeepDAO, note Discord/Discourse links                               | Not started |
| Tue | Fractional COO list: search LinkedIn for "Fractional COO," pull from Fractional Network / GoFractional directories | Not started |
| Tue | Async-first startup list: pull from We Work Remotely / Remote OK postings and HN "Who's Hiring"                    | Not started |
| Wed | Remote-first under-100 list: filter Wellfound/AngelList by remote + headcount, cross-check Crunchbase stage        | Not started |
| Wed | Consolidate all four into one sheet: name, segment, contact/channel, source, outreach status                       | Not started |

Target: 15-25 named contacts per segment by Wednesday night, enough to sustain outreach through Friday without running out.

## Track C: Outreach

| Day           | Task                                                                                   | Status      |
| ------------- | -------------------------------------------------------------------------------------- | ----------- |
| Thu           | Write one short outreach message per segment (problem framing + ask for a 20-min call) | Not started |
| Thu           | Set up a scheduling link (Calendly or similar) to remove back-and-forth                | Not started |
| Thu           | Send first batch: aim for 10-15 outreach messages                                      | Not started |
| Fri           | Send second batch: another 10-15                                                       | Not started |
| Fri / ongoing | Reply to any responses same day; book calls for next week                              | Not started |

Don't wait for the product to be perfect before sending outreach — Track A only needs to be far enough along that you can demo it live or describe it concretely, not fully polished.

## Track D: What's missing

These don't take long individually but each one determines whether a good call turns into a pilot or just a nice conversation.

| Day | Task                                                                                                                                                                 | Status      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Wed | Draft a one-page pilot pitch: what a pilot means, what's asked of them (X weeks, Y minutes/week), what they get back                                                 | Not started |
| Wed | Write 5-8 discovery-call questions that test the problem before you pitch the solution (how do they track work now, what's broken about it, who else feels the pain) | Not started |
| Wed | Decide one pilot success metric up front (e.g., X teams submitting weekly reports for 4 straight weeks)                                                              | Not started |
| Thu | Add a bare-bones privacy note/terms to the site before real users sign up with real data                                                                             | Not started |
| Thu | Update site copy so it reads as "weekly contribution reports," not generic time tracking or a to-do app                                                              | Not started |

The discovery questions matter most: on early calls, spend the first 10 minutes listening before you pitch. If the problem doesn't hurt them the way you assumed, better to learn that now than after building the pilot.

## How to track this

Keep it to two living documents, both cheap to update daily:

1. **This doc, as your task board.** Edit the Status column directly (Not started / In progress / Done) as you go. It's one page, covers all four tracks, and you can glance at it each morning to see what's behind.
2. **A separate outreach sheet, not this doc.** The Track B/C tables above are for building and sending — but once replies start coming in, per-contact tracking (sent, replied, call booked, call held, next step) needs row-level detail that doesn't belong in a roadmap doc. A simple spreadsheet with one row per contact is enough; don't reach for a CRM yet.

Check both once a day, ideally at the same time (end of day works well), and move anything not done to the next day rather than letting it quietly slide. If Track A or B slips past Wednesday, cut scope rather than the outreach track — a rough product and a real conversation beat a polished product with no one to show it to.
