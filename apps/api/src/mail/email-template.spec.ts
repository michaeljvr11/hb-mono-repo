import { EMAIL_LOGO_MARKUP, renderEmail } from './email-template';

describe('renderEmail', () => {
  it('escapes HTML-significant characters in paragraph text', () => {
    const dangerous = '<script>alert("hi")</script> & friends';
    const { html } = renderEmail('Subject', [{ type: 'paragraph', text: dangerous }]);

    expect(html).not.toContain('<script>alert("hi")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; friends');
  });

  it('escapes link text and href', () => {
    const { html } = renderEmail('Subject', [
      { type: 'link', text: '<b>click</b>', href: 'https://example.com/?a=1&b="2"' },
    ]);

    expect(html).toContain('&lt;b&gt;click&lt;/b&gt;');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('<b>click</b>');
  });

  it('lets the explicit rawHtml escape hatch bypass escaping', () => {
    const { html } = renderEmail('Subject', [
      { type: 'rawHtml', html: '<strong>bold</strong>', text: 'bold' },
    ]);

    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders the branded table-based shell with the logo wordmark', () => {
    const { html } = renderEmail('Subject', [{ type: 'paragraph', text: 'Hi' }]);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain(EMAIL_LOGO_MARKUP);
    expect(html).toContain('<table');
    expect(html).toContain('#015300'); // primary brand colour
  });

  it('produces a plain-text alternative alongside the HTML', () => {
    const { html, text } = renderEmail('Subject', [{ type: 'paragraph', text: 'Hello there' }]);

    expect(html).toContain('Hello there');
    expect(text).toContain('Hello there');
    expect(text).not.toContain('<td');
    expect(text).not.toContain('<!doctype html>');
  });
});
