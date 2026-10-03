import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from '../src/core/safeUrl';

describe('safeHttpUrl', () => {
  it('accepts http and https links', () => {
    expect(safeHttpUrl('https://earthquake.usgs.gov/earthquakes/eventpage/us123')).toBe(
      'https://earthquake.usgs.gov/earthquakes/eventpage/us123',
    );
    expect(safeHttpUrl('http://example.com/a?b=c')).toBe('http://example.com/a?b=c');
  });

  it('rejects script-capable and non-web schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('file:///etc/passwd')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects things that are not absolute URLs', () => {
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl('//evil.example')).toBeNull();
    expect(safeHttpUrl('/relative/path')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});
