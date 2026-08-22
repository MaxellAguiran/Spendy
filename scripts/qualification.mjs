const RECIPIENT = "maxell.aguiran@gmail.com";

const fieldLabels = [
  ["full_name", "Full name"],
  ["work_email", "Work email"],
  ["company", "Company"],
  ["team_type", "Team type"],
  ["website", "Website"],
  ["platform_one", "Platform 1"],
  ["platform_two", "Platform 2"],
  ["monthly_spend", "Combined monthly ad spend"],
  ["ad_count", "Approximate ad count"],
  ["uses_shopify", "Uses Shopify"],
  ["primary_outcome", "Primary outcome"],
  ["budget_problem", "Budget problem"],
];

export function buildQualificationMailto(fields) {
  const lines = fieldLabels
    .filter(([key]) => String(fields[key] ?? "").trim())
    .map(([key, label]) => `${label}: ${String(fields[key]).trim()}`);
  const company = String(fields.company ?? "your team").trim() || "your team";
  const subject = `Spendy ROAS audit qualification — ${company}`;
  const body = `Spendy ROAS audit qualification\n\n${lines.join("\n")}`;
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function setupQualificationForm() {
  const form = document.querySelector("#spendy-qualification");
  if (!form) return;
  const draft = form.querySelector("[data-qualification-email]");
  const status = form.querySelector("[data-qualification-status]");

  form.addEventListener("invalid", () => {
    form.classList.add("was-validated");
    if (status) status.textContent = "Complete the required fields before preparing your review email.";
  }, true);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form).entries());
    const href = buildQualificationMailto(fields);
    if (draft) {
      draft.href = href;
      draft.hidden = false;
    }
    if (status) {
      status.textContent = "Your review email is ready. Open the draft, check the details, and send it from your email app.";
    }
  });
}

if (typeof document !== "undefined") setupQualificationForm();
