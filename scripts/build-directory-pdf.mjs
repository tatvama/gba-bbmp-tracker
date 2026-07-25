/**
 * Renders data/gba-department-directory.json into an A4 print PDF of the
 * GBA / BBMP department officer directory (emails + postal addresses).
 *
 *   node scripts/build-directory-pdf.mjs [outDir]
 *
 * outDir defaults to the repo root. Re-run this after editing the JSON so the
 * printed directory and the machine-readable one never drift apart.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.argv[2] || ROOT;
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data/gba-department-directory.json"), "utf8"));

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SRC_LABEL = {
  "gba-hods-2025-12-08": "GBA HODs, Dec 2025",
  "gba-corporations-2025-12-08": "GBA Corporations, Dec 2025",
  "bbmp-email-directory": "BBMP e-mail directory",
  "bbmp-rti-pio-headoffice": "RTI PIO notification",
  "bbmptax-officials": "Property-tax portal",
  bswml: "BSWML",
  "gok-contact-directory": "GoK contact directory",
  "lokayukta-tel-2026-07-10": "Lokayukta directory, Jul 2026",
  "lokayukta-emails": "Lokayukta e-mails",
  kic: "Karnataka Info. Commission",
  "bbmp-legal-dept": "BBMP Legal dept",
  "bbmp-pro": "BBMP PRO",
};

/* Only surface a note when it carries an operational caution — the full
   provenance lives in the JSON, and reprinting all of it would triple the
   document without helping someone look up an address. */
const CAUTION = /(DO NOT|ABOLISHED|STALE NAME RISK|EMAIL TYPO|DATA-QUALITY FLAG|IMPORTANT:|NAME LIKELY SUPERSEDED|no officer name|No officer name|NO head-office|No @bbmp\.gov\.in|no @bbmp\.gov\.in|inferred, not stated|not individually mapped|only published address|only address)/;
const caution = (r) => (r.notes && CAUTION.test(r.notes) ? r.notes : null);

const mail = (v, gov) =>
  !v
    ? '<span class="none">none published</span>'
    : `<span class="mono">${esc(v)}</span>${gov === false ? '<span class="flagchip">gmail, as published</span>' : ""}`;

/* A phone number split across two lines is unusable in a printed reference, so
   each number is nowrap and multi-number fields break on the separator instead. */
const phones = (...vals) => {
  const list = vals
    .filter(Boolean)
    .flatMap((v) => String(v).split(/\s*\/\s*/))
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length
    ? list.map((v) => `<span class="mono num">${esc(v)}</span>`).join("<br>")
    : '<span class="none">&mdash;</span>';
};
const labelled = (label, v) => (v ? `<span class="plabel">${label}</span><br>${phones(v)}` : "");

const srcLine = (ids) =>
  ids && ids.length
    ? `<p class="srcs">${ids.map((i) => esc(SRC_LABEL[i] || i)).join(" &middot; ")}</p>`
    : "";

function record(cells, note, srcs, extraClass = "") {
  const cols = cells.length;
  return (
    `<tbody class="rec ${extraClass}">` +
    `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>` +
    (note ? `<tr class="noterow"><td colspan="${cols}"><p class="note">${esc(note)}</p>${srcLine(srcs)}</td></tr>`
          : `<tr class="noterow"><td colspan="${cols}">${srcLine(srcs)}</td></tr>`) +
    `</tbody>`
  );
}

/* ── Section 1: head-office departments ───────────────────────────── */
const deptRows = DATA.departments
  .map((d) => {
    const head =
      `<p class="rname">${esc(d.department)}</p>` +
      `<p class="rdesig">${esc(d.designation)}</p>` +
      (d.officerName ? `<p class="rofficer">${esc(d.officerName)}</p>` : `<p class="rofficer none">officer not published</p>`);
    const em = mail(d.email, d.emailIsOfficialDomain) + (d.alternateEmail ? `<p class="alt">also seen: <span class="mono">${esc(d.alternateEmail)}</span></p>` : "");
    return record([head, em, phones(d.mobile, d.phone), `<span class="addr">${esc(d.address)}</span>`], caution(d), d.sources);
  })
  .join("");

/* ── Section 2: the five city corporations ────────────────────────── */
const corpRows = DATA.corporations
  .map((c) => {
    const head =
      `<p class="rname">${esc(c.corporation)}</p>` +
      `<p class="rdesig">${esc(c.code)} &middot; ${esc(c.designation)}</p>` +
      `<p class="rofficer">${esc(c.officerName)}</p>`;
    return record(
      [
        head,
        mail(c.email, c.emailIsOfficialDomain),
        phones(c.phone) + "<br>" + labelled("Control room", c.controlRoom),
        `<span class="addr">${esc(c.address)}</span>`,
      ],
      caution(c),
      c.sources
    );
  })
  .join("");

/* ── Section 3: the eight legacy zonal offices ────────────────────── */
const zoneRows = DATA.zonalOffices
  .map((z) => {
    const head =
      `<p class="rname">${esc(z.zone)} Zone</p>` +
      `<p class="rdesig">${esc(z.designation)}</p>` +
      `<p class="rofficer none">${esc(z.nowPartOf)}</p>`;
    const em = mail(z.email, z.emailIsOfficialDomain) + (z.alternateEmail ? `<p class="alt">also seen: <span class="mono">${esc(z.alternateEmail)}</span></p>` : "");
    return record([head, em, phones(z.phone), `<span class="addr">${esc(z.address)}</span>`], caution(z), z.sources);
  })
  .join("");

/* ── Section 4: oversight & escalation ───────────────────────────── */
const overRows = DATA.oversight
  .map((o) => {
    const dead = /ABOLISHED/i.test(o.designation || "");
    const head =
      `<p class="rname${dead ? " struck" : ""}">${esc(o.office)}</p>` +
      `<p class="rdesig">${esc(o.designation)}</p>` +
      (o.officerName ? `<p class="rofficer">${esc(o.officerName)}</p>` : "");
    return record(
      [head, dead ? '<span class="none">no valid recipient</span>' : mail(o.email, o.emailIsOfficialDomain), phones(o.phone), o.address ? `<span class="addr">${esc(o.address)}</span>` : '<span class="none">&mdash;</span>'],
      caution(o),
      o.sources,
      dead ? "dead" : ""
    );
  })
  .join("");

const list = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join("");

const govCount = [
  ...DATA.departments, ...DATA.corporations, ...DATA.zonalOffices, ...DATA.oversight,
].filter((r) => r.emailIsOfficialDomain === true).length;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>GBA / BBMP Department Officer Directory</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  :root {
    --ink:#14161f; --ink2:#4a4e60; --ink3:#7d8194;
    --rule:#c9cad6; --rule2:#e3e4ec; --accent:#34459b;
    --ok:#1f6b4f; --warn:#8a6212; --crit:#9b2f26;
    --warnbg:#f9f1dc; --critbg:#f9e7e4; --accentbg:#eaedf9;
  }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; color:var(--ink); font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif; font-size:8.4pt; line-height:1.42; }
  /* 7.5pt keeps a 27-character address on one line in the email column; at 7.9pt
     the longest ones wrapped and left a single orphan character below. */
  .mono { font-family:Consolas,"Cascadia Mono","Courier New",monospace; font-size:7.5pt; font-variant-numeric:tabular-nums; word-break:break-word; }
  .num { white-space:nowrap; word-break:keep-all; }
  .plabel { font-family:Consolas,monospace; font-size:6.4pt; letter-spacing:.08em; text-transform:uppercase; color:var(--ink3); }

  /* masthead */
  .mast { border-bottom:2pt solid var(--ink); padding-bottom:9pt; margin-bottom:12pt; }
  .eyebrow { font-family:Consolas,monospace; font-size:7pt; letter-spacing:.13em; text-transform:uppercase; color:var(--accent); margin:0 0 7pt; }
  h1 { font-family:Georgia,"Times New Roman",serif; font-size:22pt; line-height:1.1; margin:0 0 7pt; font-weight:600; letter-spacing:-.01em; }
  .stand { font-family:Georgia,serif; font-size:9.3pt; line-height:1.5; color:var(--ink2); margin:0 0 9pt; max-width:150mm; }
  .meta { display:flex; flex-wrap:wrap; gap:3pt 16pt; font-family:Consolas,monospace; font-size:7.2pt; letter-spacing:.04em; color:var(--ink3); text-transform:uppercase; }
  .meta b { color:var(--ink); font-variant-numeric:tabular-nums; }

  /* alerts */
  .alert { border:.5pt solid var(--rule); border-left:2.5pt solid var(--crit); background:var(--critbg); padding:6pt 8pt; margin-bottom:5pt; break-inside:avoid; }
  .alert.w { border-left-color:var(--warn); background:var(--warnbg); }
  .alert p { margin:0; font-size:8.2pt; }
  .alert .tag { font-family:Consolas,monospace; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; font-weight:700; color:var(--crit); display:block; margin-bottom:2pt; }
  .alert.w .tag { color:var(--warn); }

  /* sections */
  h2 { font-size:12pt; margin:16pt 0 0; padding-bottom:4pt; border-bottom:1pt solid var(--ink); font-weight:600; letter-spacing:-.01em; break-after:avoid; }
  h2 .c { font-family:Consolas,monospace; font-size:7.2pt; font-weight:400; letter-spacing:.08em; text-transform:uppercase; color:var(--ink3); float:right; padding-top:4pt; }
  .lede { font-family:Georgia,serif; font-size:8.4pt; color:var(--ink2); margin:6pt 0 8pt; break-after:avoid; }

  table { width:100%; border-collapse:collapse; }
  thead { display:table-header-group; }
  th { font-family:Consolas,monospace; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3);
       text-align:left; font-weight:400; padding:4pt 5pt; border-bottom:.5pt solid var(--rule); }
  tbody.rec { break-inside:avoid; border-bottom:.5pt solid var(--rule2); }
  td { padding:5pt 5pt 2pt; vertical-align:top; }
  tbody.rec .noterow td { padding:0 5pt 5pt; }
  tbody.dead .rname { color:var(--ink3); }
  .struck { text-decoration:line-through; }

  .rname { margin:0; font-weight:600; font-size:8.6pt; line-height:1.3; }
  .rdesig { margin:1pt 0 0; color:var(--ink2); font-size:7.8pt; line-height:1.32; }
  .rofficer { margin:2pt 0 0; font-size:7.9pt; }
  .addr { font-size:8pt; line-height:1.38; }
  .none { color:var(--ink3); font-style:italic; }
  .alt { margin:2pt 0 0; font-size:7.2pt; color:var(--ink3); }
  .flagchip { display:inline-block; font-family:Consolas,monospace; font-size:6.4pt; letter-spacing:.06em; text-transform:uppercase;
              color:var(--warn); border:.5pt solid var(--warn); background:var(--warnbg); padding:0 3pt; margin-left:3pt; white-space:nowrap; }
  .note { margin:2pt 0 0; font-size:7.3pt; line-height:1.4; color:var(--ink2); border-left:1.5pt solid var(--rule); padding-left:5pt; }
  .srcs { margin:2pt 0 0; font-family:Consolas,monospace; font-size:6.4pt; letter-spacing:.03em; text-transform:uppercase; color:var(--ink3); }

  /* appendix */
  .appendix { break-before:page; }
  .appendix h2:first-of-type { margin-top:0; }
  .appendix ul { margin:8pt 0 0; padding-left:14pt; }
  .appendix li { font-size:8.3pt; margin-bottom:5pt; line-height:1.45; color:var(--ink2); max-width:165mm; }
  .appendix li::marker { color:var(--accent); }
  .srclist li { font-size:8pt; }
  .srclist .u { font-family:Consolas,monospace; font-size:6.8pt; color:var(--accent); word-break:break-all; display:block; }
  .colophon { margin-top:16pt; padding-top:8pt; border-top:.5pt solid var(--rule); font-family:Consolas,monospace;
              font-size:6.8pt; line-height:1.6; color:var(--ink3); letter-spacing:.03em; }
</style></head><body>

<header class="mast">
  <p class="eyebrow">Extracted from official sources &middot; no value inferred</p>
  <h1>GBA / BBMP Department Officer Directory</h1>
  <p class="stand">Head-of-department officers, official email IDs and office postal addresses for the major Greater
    Bengaluru Authority departments, the five city corporations, the eight legacy BBMP zonal offices, and the external
    oversight authorities. Every email, phone number and PIN code below was read off an official page or official PDF.
    Where a post has no published official-domain mailbox, the field is left empty rather than guessed.</p>
  <div class="meta">
    <span>Extracted <b>${esc(DATA.extractedOn)}</b></span>
    <span>Officer names as on <b>08-12-2025</b></span>
    <span><b>${DATA.departments.length + DATA.corporations.length + DATA.zonalOffices.length + DATA.oversight.length}</b> records</span>
    <span><b>${govCount}</b> gov.in mailboxes</span>
    <span><b>${DATA.sources.length}</b> sources</span>
  </div>
</header>

<div class="alert">
  <span class="tag">Do not use</span>
  <p>The <b>Karnataka Anti-Corruption Bureau has no valid recipient.</b> It was abolished by the Karnataka High Court on
    11 August 2022 and its Prevention of Corruption Act powers reverted to the Karnataka Lokayukta Police.
    Anti-corruption correspondence must be addressed to the Lokayukta Police ADGP instead. The ACB row is retained in
    this directory, struck through, so the dead address stays recognisable.</p>
</div>
<div class="alert w">
  <span class="tag">Verify before sending</span>
  <p>One email is <b>not reproduced byte-for-byte.</b> The official corporations PDF prints the Bengaluru South
    Commissioner as <span class="mono">comm.south.gba@gmail.comm</span> &mdash; a double &ldquo;m&rdquo;. The trailing
    character is dropped here as the evident intent, but confirm it before use.</p>
</div>
<div class="alert w">
  <span class="tag">Names age, offices do not</span>
  <p>Officer <i>names</i> come from the only post-GBA official list, dated 08-12-2025, and are roughly seven months old
    &mdash; the Bengaluru Central Commissioner in particular appears to have changed. Office emails, landlines and
    postal addresses are far more durable than the names attached to them.</p>
</div>

<h2><span class="c">${DATA.departments.length} posts</span>Head office departments</h2>
<p class="lede">Unless a different address is given, these sit at the GBA Head Office (Central Office), N.R. Square /
  Hudson Circle, Bengaluru &ndash; 560002. Floor and wing are part of the address where published.</p>
<table>
  <colgroup><col style="width:30%"><col style="width:26%"><col style="width:15%"><col style="width:29%"></colgroup>
  <thead><tr><th>Department &middot; designation &middot; officer</th><th>Email</th><th>Phone</th><th>Office address</th></tr></thead>
  ${deptRows}
</table>

<h2><span class="c">${DATA.corporations.length} corporations</span>The five city corporations</h2>
<p class="lede">Created under the Greater Bengaluru Governance Act. None has an elected council &mdash; the GBA Chief
  Commissioner is formally Administrator to all five, and is therefore the single statutory escalation point above every
  Commissioner below. All five publish only Gmail addresses; that is what the authority itself publishes.</p>
<table>
  <colgroup><col style="width:26%"><col style="width:27%"><col style="width:21%"><col style="width:26%"></colgroup>
  <thead><tr><th>Corporation &middot; commissioner</th><th>Email</th><th>Phone</th><th>Head office address</th></tr></thead>
  ${corpRows}
</table>

<h2><span class="c">${DATA.zonalOffices.length} zones</span>Legacy BBMP zonal offices</h2>
<p class="lede">The eight pre-reorganisation zones. Their designation mailboxes and postal addresses remain the operative
  ones, and four of these buildings are now corporation headquarters. Deputy Commissioner equivalents follow the same
  pattern: dceast@, dcwest@, dcsouth@, dcmpura@, dcyel@, dcdhalli@, dcrrnagar@bbmp.gov.in.</p>
<table>
  <colgroup><col style="width:27%"><col style="width:27%"><col style="width:13%"><col style="width:33%"></colgroup>
  <thead><tr><th>Zone &middot; designation</th><th>Email</th><th>Phone</th><th>Office address</th></tr></thead>
  ${zoneRows}
</table>

<h2><span class="c">${DATA.oversight.length} offices</span>Oversight &amp; escalation</h2>
<p class="lede">Administrative escalation above the GBA, the anti-corruption and vigilance route, and the RTI
  second-appeal authority.</p>
<table>
  <colgroup><col style="width:28%"><col style="width:26%"><col style="width:15%"><col style="width:31%"></colgroup>
  <thead><tr><th>Office &middot; designation &middot; officer</th><th>Email</th><th>Phone</th><th>Address</th></tr></thead>
  ${overRows}
</table>

<div class="appendix">
  <h2>What could not be found</h2>
  <ul>${list(DATA.gaps)}</ul>

  <h2>Structural findings</h2>
  <ul>${list(DATA.structuralFindings)}</ul>

  <h2>Condition of the sources</h2>
  <ul>${list(DATA.sourceHealth)}</ul>

  <h2>Sources</h2>
  <ul class="srclist">${DATA.sources
    .map((s) => `<li><b>${esc(s.title)}</b> &mdash; ${s.asOn ? "as on " + esc(s.asOn) : "undated"}. ${esc(s.use)}<span class="u">${esc(s.url)}</span></li>`)
    .join("")}</ul>

  <p class="colophon">Compiled 2026-07-25 for the GBA / BBMP complaint tracker. Machine-readable original:
    data/gba-department-directory.json, which carries the per-field source ids, confidence grades and the full
    provenance notes abridged in this document. Nothing in this directory was inferred: a blank field means the
    authority publishes no value, not that the value is unknown to the compiler.</p>
</div>
</body></html>`;

const htmlPath = path.join(OUT_DIR, "gba-officer-directory.print.html");
fs.writeFileSync(htmlPath, html);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
const pdfPath = path.join(OUT_DIR, "GBA-BBMP-Department-Officer-Directory.pdf");
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-family:Consolas,monospace;font-size:6pt;letter-spacing:.08em;text-transform:uppercase;color:#9497a6;width:100%;padding:0 14mm;display:flex;justify-content:space-between;">' +
    "<span>GBA / BBMP department officer directory</span><span>Extracted " + DATA.extractedOn + "</span></div>",
  footerTemplate:
    '<div style="font-family:Consolas,monospace;font-size:6pt;letter-spacing:.08em;text-transform:uppercase;color:#9497a6;width:100%;padding:0 14mm;display:flex;justify-content:space-between;">' +
    "<span>Official sources only &middot; blank field = nothing published</span>" +
    '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
});
await browser.close();

const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
console.log("PDF:", pdfPath, kb + " KB");
