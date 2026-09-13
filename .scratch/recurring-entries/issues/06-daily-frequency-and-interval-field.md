# 06 — Daily frequency, "Tous les X ..." field order, numeric interval input

**What to build:** On the recurring rule form, the schedule reads as "Tous les X jours / mois / années" — the interval number comes first, the frequency unit second — and Daily is a selectable frequency alongside Weekly/Monthly/Yearly, working end to end (form, persisted rule, occurrence generation, and the plain-language schedule summaries shown in the rules list).

Scope:

- Add a Daily value to the frequency vocabulary (frontend type and its backend counterpart), including its plain-language summary ("Tous les jours") and its handling in the occurrence-generation engine.
- Reorder the schedule row so the interval number comes before the frequency unit, phrased around "Tous les X ...".
- The interval field becomes a native numeric input with autocomplete disabled, while preserving current validation (integer, minimum 1, inline error).

**Blocked by:** None — can start immediately (independent of 05)

**Status:** ready-for-agent

- [ ] Frequency accepts a Daily value end to end: form, persisted rule, occurrence generation, and schedule summaries
- [ ] Schedule row shows interval-then-unit order, phrased "Tous les X jours/mois/années"
- [ ] Interval input is a native numeric input with autocomplete disabled
- [ ] Existing interval validation (integer, minimum 1, inline error) still works
- [ ] Occurrence generation is covered by tests for daily rules, including interval > 1 (e.g. every 2 days)
