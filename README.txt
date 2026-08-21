SPENDY

Static public site for a single service: machine-learning ad-spend forecasting
and exact fixed-budget allocation for marketing agencies.

ACTIVE ROUTES
- /                                  landing page
- /dragon-analytics.html              method and service detail (legacy URL)
- /labs/monthly-ad-report.html        generated, checked sample report

RETIRED ROUTES
Former public routes remain reachable as short noindex retirement pages. They
lead visitors back to the active Spendy service and are excluded from the
sitemap and primary navigation.

INTEGRITY
The sample report uses synthetic data. It releases a recommendation only when
the forecast passes its later-period comparison, and its line items reconcile
to the supplied fixed budget. Forecasts are estimates, not performance promises.

LOCAL CHECKS
npm test
npm run generate:social
