# Spendy Single-Service Rebrand

## Completed scope

1. Replaced public naming with Spendy and introduced a code-native signal mark.
2. Rewrote the landing, method, and sample-report pages around machine-learning
   ad-spend forecasts and fixed-budget allocation.
3. Preserved the evidence renderer and its fail-closed report behavior.
4. Replaced former portfolio, research, and unrelated-service routes with
   noindex retirement pages.
5. Regenerated the three active social cards and removed retired-brand media.
6. Added regression coverage for the focused public-service contract.

## Release checks

- Run the static contract suite and unit tests.
- Validate all public HTML and internal links.
- Generate social cards from `tools/social-cards.json`.
- Check desktop and mobile layouts, primary actions, keyboard behavior, and
  checked-report failure states before publication.
