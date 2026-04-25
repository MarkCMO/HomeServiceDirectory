// email-template.js - Branded email wrapper for all outbound emails

function emailWrap(title, bodyHTML) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F7FA;font-family:'Inter','Segoe UI',system-ui,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:1.6rem;font-weight:800;color:#0B1D33;">&#x1F6A8; Home<span style="color:#DC3545;">Service</span></span>
  </div>
  <div style="background:#FFFFFF;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(11,29,51,0.12);">
    <h2 style="font-size:1.3rem;color:#0B1D33;margin:0 0 16px;">${title}</h2>
    ${bodyHTML}
  </div>
  <div style="text-align:center;margin-top:24px;font-size:0.8rem;color:#9BAFC4;">
    <p>&copy; ${new Date().getFullYear()} HomeServiceDirectory - All Rights Reserved</p>
    <p>America's Emergency Home Service Directory</p>
  </div>
</div>
</body></html>`;
}

module.exports = { emailWrap };
