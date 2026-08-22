SPENDY

Static public site for a single fixed-fee service: an evidence-qualified ROAS
Budget Audit for European performance marketing agencies.

ACTIVE ROUTES
- /                                  landing page
- /fit-check.html                     no-files fit-check form
- /fit-check-thanks.html              submission confirmation
- /case-study.html                    evidence boundary and historical simulation
- /labs/monthly-ad-report.html        generated, checked illustrative sample report

RETIRED ROUTES
Former public routes remain reachable as short noindex retirement pages. They
lead visitors back to the active Spendy service and are excluded from the
sitemap and primary navigation.

INTEGRITY
The public case study and sample report release favorable values only after
their respective evidence checks pass. They are separate from the anonymous
real engagement and do not promise client performance.

The fit check sends only a small business-context payload after a release build
has been configured with the owner-provided form ID. Local previews intentionally
block submission. See `docs/lead-funnel-operating-model.md` for the required
production settings and lead-triage workflow.

LOCAL CHECKS
npm test
npm run generate:social
npm run build
