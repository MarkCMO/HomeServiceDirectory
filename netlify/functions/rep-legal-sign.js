// rep-legal-sign.js - Rep signs a legal document during onboarding
// POST /api/rep-legal-sign { doc_type, agreed: true }
// After all 10 docs signed, rep status advances to 'active'
//
// Required docs: nda | non_compete | rep_agreement | commission_schedule |
//                w9_info | ach_auth | conduct_policy | ip_assignment | arbitration | at_will

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json'
});

const REQUIRED_DOCS = [
  'nda',
  'non_compete',
  'rep_agreement',
  'commission_schedule',
  'w9_info',
  'ach_auth',
  'conduct_policy',
  'ip_assignment',
  'arbitration',
  'at_will'
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const repId = auth.session.user_id;

    // GET: return signing status
    if (event.httpMethod === 'GET') {
      const { data: signed } = await db.rep_legal_docs()
        .select('doc_type, signed_at')
        .eq('rep_id', repId);

      const signedTypes = (signed || []).map(d => d.doc_type);
      const pending     = REQUIRED_DOCS.filter(d => !signedTypes.includes(d));

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          required:   REQUIRED_DOCS,
          signed:     signedTypes,
          pending,
          complete:   pending.length === 0,
          count:      `${signedTypes.length}/${REQUIRED_DOCS.length}`
        })
      };
    }

    // POST: sign a document
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

    const data = JSON.parse(event.body || '{}');
    const { doc_type, agreed } = data;

    if (!doc_type || !REQUIRED_DOCS.includes(doc_type)) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Invalid doc_type. Required docs: ' + REQUIRED_DOCS.join(', ') }) };
    }
    if (!agreed) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'agreed must be true to sign' }) };
    }

    // Get legal doc template (if exists)
    const { data: docTemplate } = await db.legal_docs()
      .select('id')
      .eq('doc_type', doc_type)
      .eq('active', true)
      .maybeSingle();

    const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ua = event.headers['user-agent'] || '';

    // Upsert signature record
    const { error: signErr } = await db.rep_legal_docs().upsert({
      rep_id:       repId,
      legal_doc_id: docTemplate?.id || null,
      doc_type,
      signed_at:    new Date().toISOString(),
      ip_address:   ip,
      user_agent:   ua
    }, { onConflict: 'rep_id,doc_type' });

    if (signErr) throw signErr;

    // Check if all required docs now signed
    const { data: allSigned } = await db.rep_legal_docs()
      .select('doc_type')
      .eq('rep_id', repId);

    const signedTypes = (allSigned || []).map(d => d.doc_type);
    const allComplete = REQUIRED_DOCS.every(d => signedTypes.includes(d));

    if (allComplete) {
      // Activate rep
      await db.sales_reps().update({
        status:          'active',
        docs_signed_at:  new Date().toISOString(),
        onboarded_at:    new Date().toISOString()
      }).eq('id', repId);

      // Notify admin
      if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
        const { data: rep } = await db.sales_reps()
          .select('first_name, last_name, email')
          .eq('id', repId)
          .single();
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
              to:      (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()),
              subject: `Rep Fully Onboarded: ${rep?.first_name} ${rep?.last_name}`,
              html:    `<p><strong>${rep?.first_name} ${rep?.last_name}</strong> (${rep?.email}) has signed all ${REQUIRED_DOCS.length} onboarding documents and is now ACTIVE.</p>`
            })
          });
        } catch (e) {}
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        message:      `${doc_type} signed`,
        doc_type,
        signed_at:    new Date().toISOString(),
        all_complete: allComplete,
        signed_count: signedTypes.length,
        total_required: REQUIRED_DOCS.length,
        ...(allComplete ? { status_changed_to: 'active', activated: true } : {})
      })
    };
  } catch (err) {
    console.error('rep-legal-sign error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
