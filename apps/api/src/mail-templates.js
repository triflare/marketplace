import { brandingColors, product } from './product.js';

// A mail body is read in clients that strip stylesheets, scripts, and anything
// newer than a table, so the layout is a table with inline styles. Every
// message shares it: the brand line, one card, and a footer that says why the
// message arrived.

const TEXT = '#111827';
const MUTED = '#4b5563';
const FAINT = '#6b7280';
const BORDER = '#e5e7eb';
const CANVAS = '#f4f4f5';
const CODE_BACKGROUND = '#f3f4f6';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hostOf(config) {
  try {
    return new URL(config.publicBaseUrl).host;
  } catch {
    return product.name;
  }
}

// A button in a mail client is a link in a table cell: padding on the anchor,
// background on the cell, so Outlook pads it too.
export function actionButton({ href, label }) {
  const { primary } = brandingColors();
  const url = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px">
  <tr>
    <td align="center" bgcolor="${primary}" style="border-radius:8px">
      <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function codeBlock(code) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" bgcolor="${CODE_BACKGROUND}" style="border:1px solid ${BORDER};border-radius:10px;padding:20px 12px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:600;letter-spacing:0.28em;color:${TEXT}">${escapeHtml(code)}</td>
  </tr>
</table>`;
}

// The address a client cannot make clickable in some webmail, printed as text
// under the button so the message survives a link being rewritten.
export function fallbackLink(href) {
  return `<p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${FAINT};word-break:break-all">If the button doesn’t work, paste this address into your browser:<br><span style="color:${MUTED}">${escapeHtml(href)}</span></p>`;
}

export function emailLayout({ intro, content, footnote, config }) {
  const { primary, secondary } = brandingColors();
  const name = escapeHtml(product.name);
  const host = escapeHtml(hostOf(config));
  const headline = escapeHtml(intro);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${name}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${headline}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px">
        <tr>
          <td style="padding:0 0 18px">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${primary}">${name}</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:32px">
            <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:600;color:${TEXT}">${headline}</h1>
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0">
            <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${FAINT}">${footnote}</p>
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${FAINT}">Sent by ${name} on ${host}. <span style="color:${secondary}">${escapeHtml(product.tagline ?? '')}</span></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function paragraph(text) {
  return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${MUTED}">${text}</p>`;
}

export { escapeHtml };
