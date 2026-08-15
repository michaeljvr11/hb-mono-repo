/**
 * Branded reusable email layout renderer. No template engine dependency —
 * plain TypeScript producing an email-safe (table-based, inlined styles)
 * HTML document plus a matching plain-text alternative.
 *
 * Design tokens resolved to literal values (docs/design/DESIGN.md) — most
 * mail clients strip CSS custom properties, so values are baked in here
 * rather than referenced.
 */

const FONT_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const COLORS = {
  primary: '#015300',
  primaryContainer: '#026e00',
  onPrimary: '#ffffff',
  background: '#fcf9f8',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#f0eded',
  onSurface: '#1c1b1b',
  onSurfaceVariant: '#404a3b',
  outlineVariant: '#bfcab7',
};

/**
 * The brand mark shown in the email header. There is no approved logo asset
 * yet (spec open question 6), so this ships as a text wordmark rendered on
 * the primary colour. This is the ONLY place the logo is referenced —
 * swapping in a real asset later (e.g. an `<img>` tag pointing at a hosted
 * PNG) is a one-line change here.
 */
export const EMAIL_LOGO_MARKUP = 'H&amp;B';

/**
 * Typed content blocks a caller composes instead of hand-writing HTML.
 * Every block is HTML-escaped by default. `rawHtml` is the sole, obviously
 * named escape hatch for callers that already have trusted markup — it also
 * requires an explicit plain-text fallback since raw HTML can't be safely
 * reduced to text automatically.
 */
export type EmailContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'rawHtml'; html: string; text: string };

export interface RenderedEmail {
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blockToHtml(block: EmailContentBlock): string {
  switch (block.type) {
    case 'heading':
      return `<tr><td style="padding:0 0 12px 0; font-family:${FONT_STACK}; font-size:20px; line-height:28px; font-weight:700; color:${COLORS.onSurface};">${escapeHtml(block.text)}</td></tr>`;
    case 'paragraph':
      return `<tr><td style="padding:0 0 16px 0; font-family:${FONT_STACK}; font-size:16px; line-height:24px; font-weight:400; color:${COLORS.onSurface};">${escapeHtml(block.text)}</td></tr>`;
    case 'link':
      return `<tr><td style="padding:0 0 16px 0;"><a href="${escapeHtml(block.href)}" style="font-family:${FONT_STACK}; font-size:16px; line-height:24px; font-weight:600; color:${COLORS.primary}; text-decoration:underline;">${escapeHtml(block.text)}</a></td></tr>`;
    case 'rawHtml':
      return `<tr><td style="padding:0 0 16px 0;">${block.html}</td></tr>`;
  }
}

function blockToText(block: EmailContentBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return block.text;
    case 'link':
      return `${block.text}: ${block.href}`;
    case 'rawHtml':
      return block.text;
  }
}

function renderHtmlDocument(subject: string, blocks: EmailContentBlock[]): string {
  const bodyRows = blocks.map(blockToHtml).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLORS.background};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.background};">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:${COLORS.surfaceContainerLowest}; border:1px solid ${COLORS.outlineVariant}; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background-color:${COLORS.primary}; padding:24px 32px;">
                <span style="font-family:${FONT_STACK}; font-size:20px; font-weight:700; color:${COLORS.onPrimary}; letter-spacing:0.5px;">${EMAIL_LOGO_MARKUP}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${bodyRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:${COLORS.surfaceContainer}; padding:16px 32px; border-top:1px solid ${COLORS.outlineVariant};">
                <span style="display:block; font-family:${FONT_STACK}; font-size:14px; line-height:20px; font-weight:600; color:${COLORS.onSurfaceVariant};">H&amp;B &middot; South Africa &rarr; Namibia</span>
                <span style="display:block; font-family:${FONT_STACK}; font-size:12px; line-height:18px; font-weight:400; color:${COLORS.onSurfaceVariant};">This is an automated message &mdash; please don't reply to this email.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPlainText(blocks: EmailContentBlock[]): string {
  const lines = blocks.map(blockToText);
  lines.push(
    'H&B · South Africa -> Namibia',
    "This is an automated message — please don't reply to this email.",
  );
  return lines.join('\n\n');
}

/**
 * Renders a branded transactional email. Callers supply a subject plus a
 * list of typed content blocks (see `EmailContentBlock`) instead of
 * hand-writing HTML; every block is escaped by default.
 */
export function renderEmail(subject: string, blocks: EmailContentBlock[]): RenderedEmail {
  return {
    html: renderHtmlDocument(subject, blocks),
    text: renderPlainText(blocks),
  };
}
