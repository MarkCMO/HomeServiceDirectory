// pdf-packet.js - Generate legal document PDF packets for reps/managers
// POST /api/pdf-packet { recipient_type: 'rep', recipient_id }
// Uses playwright-core + @sparticuz/chromium-min
// Returns download URL (stored in Netlify Blobs)

const { requireAuth }     = require('./_auth');
const { db }              = require('./_supabase');
const { getStore }        = require('./blobs');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json'
});

// Legal document HTML templates
const LEGAL_TEMPLATES = {
  nda: (rep) => `
    <html><head><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1f36;}
    h1{font-size:1.5rem;text-align:center;margin-bottom:8px;}h2{font-size:1.1rem;margin-top:32px;}
    p{line-height:1.7;margin:12px 0;}.sig{margin-top:60px;border-top:1px solid #ccc;padding-top:12px;}
    </style></head><body>
    <h1>NON-DISCLOSURE AGREEMENT</h1>
    <p style="text-align:center;color:#6b7280;">HomeServiceDirectory / WETYR Corporation</p>
    <p>This Non-Disclosure Agreement ("Agreement") is entered into as of <strong>${new Date().toLocaleDateString()}</strong> between <strong>WETYR Corporation</strong> ("Company") and <strong>${rep.first_name} ${rep.last_name}</strong> ("Representative").</p>
    <h2>1. Confidential Information</h2>
    <p>Representative agrees to keep confidential all business information, client lists, pricing, commission structures, proprietary technology, and trade secrets disclosed by Company.</p>
    <h2>2. Non-Disclosure Obligation</h2>
    <p>Representative shall not disclose, publish, or use for personal benefit any Confidential Information during employment or for two (2) years thereafter.</p>
    <h2>3. Return of Materials</h2>
    <p>Upon termination, Representative shall promptly return all Company materials and delete all digital copies of Confidential Information.</p>
    <h2>4. Remedies</h2>
    <p>Representative acknowledges that breach of this Agreement would cause irreparable harm and consents to injunctive relief without bond requirement.</p>
    <div class="sig"><p><strong>Electronically Signed by:</strong> ${rep.first_name} ${rep.last_name} (${rep.email})</p>
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>IP Address:</strong> [Recorded at signing]</p></div></body></html>`,

  non_compete: (rep) => `
    <html><head><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1f36;}
    h1{font-size:1.5rem;text-align:center;}h2{font-size:1.1rem;margin-top:28px;}p{line-height:1.7;}
    .sig{margin-top:60px;border-top:1px solid #ccc;padding-top:12px;}</style></head><body>
    <h1>NON-COMPETE AGREEMENT</h1>
    <p style="text-align:center;color:#6b7280;">HomeServiceDirectory / WETYR Corporation</p>
    <p>Effective <strong>${new Date().toLocaleDateString()}</strong>. Parties: <strong>WETYR Corporation</strong> and <strong>${rep.first_name} ${rep.last_name}</strong>.</p>
    <h2>1. Restriction Period</h2>
    <p>During Representative's engagement and for twelve (12) months following termination, Representative shall not directly or indirectly engage in building, operating, or selling services for any competing home service directory platform.</p>
    <h2>2. Geographic Scope</h2>
    <p>This restriction applies within the United States of America, where Company operates its HomeServiceDirectory platform.</p>
    <h2>3. Non-Solicitation</h2>
    <p>Representative shall not solicit Company clients, employees, or contractors for twelve (12) months post-termination.</p>
    <div class="sig"><p><strong>Signed:</strong> ${rep.first_name} ${rep.last_name} (${rep.email})</p>
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p></div></body></html>`,

  rep_agreement: (rep) => `
    <html><head><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1f36;}
    h1{font-size:1.5rem;text-align:center;}h2{font-size:1.1rem;margin-top:28px;}p{line-height:1.7;}
    table{width:100%;border-collapse:collapse;margin:16px 0;}td{padding:8px;border:1px solid #e5e7eb;}
    .sig{margin-top:60px;border-top:1px solid #ccc;padding-top:12px;}</style></head><body>
    <h1>INDEPENDENT SALES REPRESENTATIVE AGREEMENT</h1>
    <p>This Agreement is between <strong>WETYR Corporation</strong> ("Company") and <strong>${rep.first_name} ${rep.last_name}</strong> ("Representative"), effective ${new Date().toLocaleDateString()}.</p>
    <h2>1. Independent Contractor Status</h2>
    <p>Representative is an independent contractor, not an employee. Representative is responsible for all taxes on compensation received.</p>
    <h2>2. Services</h2>
    <p>Representative shall solicit listings from home service businesses for inclusion in Company's HomeServiceDirectory platform across assigned territories.</p>
    <h2>3. Commission Structure</h2>
    <table><tr><td><strong>Tier</strong></td><td><strong>Active Clients</strong></td><td><strong>Commission Rate</strong></td></tr>
    <tr><td>Standard</td><td>0-9</td><td>30%</td></tr>
    <tr><td>Senior</td><td>10-24</td><td>40%</td></tr>
    <tr><td>Elite</td><td>25+</td><td>50%</td></tr></table>
    <h2>4. Vesting & Clawback</h2>
    <p>Commissions vest 90 days after the client's subscription start date. A 60-day clawback applies if the client cancels within the clawback window.</p>
    <h2>5. Payment</h2>
    <p>Commissions are paid monthly via ACH for all earned (fully vested) commissions.</p>
    <div class="sig"><p><strong>Signed:</strong> ${rep.first_name} ${rep.last_name} (${rep.email})</p>
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p></div></body></html>`,

  commission_schedule: (rep) => `
    <html><head><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;}
    h1{text-align:center;}table{width:100%;border-collapse:collapse;}td,th{padding:10px;border:1px solid #e5e7eb;}
    th{background:#f9fafb;}.sig{margin-top:40px;border-top:1px solid #ccc;padding-top:12px;}</style></head><body>
    <h1>COMMISSION SCHEDULE</h1>
    <p>Effective: ${new Date().toLocaleDateString()} | Rep: ${rep.first_name} ${rep.last_name}</p>
    <table><tr><th>Plan</th><th>Monthly Price</th><th>Standard (30%)</th><th>Senior (40%)</th><th>Elite (50%)</th></tr>
    <tr><td>Pro</td><td>$149</td><td>$44.70</td><td>$59.60</td><td>$74.50</td></tr>
    <tr><td>Premium</td><td>$299</td><td>$89.70</td><td>$119.60</td><td>$149.50</td></tr>
    <tr><td>Elite</td><td>$499</td><td>$149.70</td><td>$199.60</td><td>$249.50</td></tr>
    <tr><td>City Sponsor</td><td>$799-1,499</td><td>$239.70+</td><td>$319.60+</td><td>$399.50+</td></tr></table>
    <p style="margin-top:16px;color:#6b7280;font-size:0.9rem;">Commission is calculated on net subscription revenue received after processor fees. Vesting: 90 days from sub start. Clawback: 60 days.</p>
    <div class="sig"><p><strong>Signed:</strong> ${rep.first_name} ${rep.last_name}</p><p><strong>Date:</strong> ${new Date().toLocaleString()}</p></div></body></html>`
};

// Simple HTML-only packet (no Chromium dependency) for development
function buildHTMLPacket(rep, docTypes) {
  const docs = docTypes.map(type => {
    const fn = LEGAL_TEMPLATES[type];
    return fn ? fn(rep) : `<h1>${type} - Template not found</h1>`;
  });
  return `<!DOCTYPE html><html><head><style>
    @page { margin: 1in; }
    .page-break { page-break-before: always; }
  </style></head><body>
    ${docs.join('<div class="page-break"></div>')}
  </body></html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAuth(event, ['rep', 'admin', 'manager']);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const data    = JSON.parse(event.body || '{}');
    const repId   = data.recipient_id || auth.session.user_id;
    const docTypes = data.doc_types || Object.keys(LEGAL_TEMPLATES);

    // Load rep data
    const { data: rep, error: repErr } = await db.sales_reps()
      .select('id, first_name, last_name, email, commission_tier')
      .eq('id', repId)
      .single();

    if (repErr || !rep) {
      return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Rep not found' }) };
    }

    // Build HTML packet
    const html    = buildHTMLPacket(rep, docTypes);
    const packetId = `packet-${rep.id}-${Date.now()}`;

    // Try to generate PDF with Playwright (if available)
    let pdfBuffer = null;
    let pdfUrl    = null;

    try {
      const chromium = require('@sparticuz/chromium-min');
      const { chromium: playwright } = require('playwright-core');

      chromium.setHeadlessMode = true;
      const execPath = await chromium.executablePath(process.env.CHROMIUM_PATH || undefined);

      const browser = await playwright.launch({
        args:            chromium.args,
        executablePath:  execPath,
        headless:        true
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      pdfBuffer = await page.pdf({ format: 'Letter', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } });
      await browser.close();

      // Store PDF in Blobs
      const pdfStore = getStore('pdf-packets');
      await pdfStore.set(packetId + '.pdf', pdfBuffer, { metadata: { repId: rep.id, createdAt: new Date().toISOString() } });
      pdfUrl = `/api/pdf-packet-download?id=${packetId}`;
    } catch (pdfErr) {
      console.log('PDF generation unavailable (Chromium not found), returning HTML:', pdfErr.message);
    }

    // Record packet in DB
    await db.pdf_packets().insert({
      recipient_type: 'rep',
      recipient_id:   rep.id,
      doc_types:      docTypes,
      pdf_url:        pdfUrl
    });

    if (pdfBuffer) {
      return {
        statusCode: 200,
        headers: { ...cors(), 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="onboarding-packet-${rep.first_name}-${rep.last_name}.pdf"` },
        body:       pdfBuffer.toString('base64'),
        isBase64Encoded: true
      };
    }

    // Fallback: return HTML
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html', 'Content-Disposition': `attachment; filename="onboarding-packet.html"` },
      body: html
    };
  } catch (err) {
    console.error('pdf-packet error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
