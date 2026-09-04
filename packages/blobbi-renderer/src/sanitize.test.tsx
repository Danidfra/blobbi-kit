/**
 * The OPTIONAL sanitizer boundary.
 *
 * The body artwork is package data compiled into the bundle, and every input
 * that reaches it is either a validated color or a sanitized id, so the
 * renderer ships no sanitizer. Hosts that want defense in depth, or that
 * post-process the markup, pass a pure string-to-string function. It runs
 * once per structural change on the finished body SVG (after the gaze markup),
 * and its result is what reaches the DOM.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BlobbiRenderer } from './index';

const VISUAL = { stage: 'adult' as const, adultType: 'owli', baseColor: '#8866aa', eyeColor: '#112233' };
const body = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box]') as HTMLElement;

describe('sanitize', () => {
  it('receives the finished SVG string and its output is what is rendered', () => {
    const seen: string[] = [];
    const sanitize = (svg: string) => {
      seen.push(svg);
      return svg.replace(/<svg\b/, '<svg data-sanitized="yes"');
    };
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="san-1" sanitize={sanitize} eyeOffset={{ x: 0.5, y: 0 }} />,
    );
    expect(seen).toHaveLength(1);
    // Some forms open with an XML declaration; the root element is what matters.
    expect(seen[0]).toMatch(/<svg\b/);
    // Runs AFTER the gaze markup, so a sanitizer sees exactly what would be mounted.
    expect(seen[0]).toContain('blobbi-pupil');
    expect(body(container).querySelector('svg')!.getAttribute('data-sanitized')).toBe('yes');
  });

  it('is not re-run when props that do not change the SVG change', () => {
    const sanitize = vi.fn((svg: string) => svg);
    const { rerender } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="san-memo" sanitize={sanitize} size="lg" eyeOffset={{ x: 0, y: 0 }} />,
    );
    // Size, gaze direction and className are wrapper-level: no rebuild.
    rerender(
      <BlobbiRenderer visual={VISUAL} instanceId="san-memo" sanitize={sanitize} size="3xl" eyeOffset={{ x: 1, y: -1 }} className="x" />,
    );
    expect(sanitize).toHaveBeenCalledTimes(1);
    // A structural change (facing) rebuilds, and re-sanitizes, exactly once.
    rerender(
      <BlobbiRenderer visual={VISUAL} instanceId="san-memo" sanitize={sanitize} facing="back" />,
    );
    expect(sanitize).toHaveBeenCalledTimes(2);
  });

  it('a sanitizer that removes everything renders nothing rather than stale markup', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="san-empty" sanitize={() => ''} />,
    );
    expect(container.querySelector('[data-blobbi-renderer]')).toBeNull();
  });

  it('without a sanitizer the body markup is the raw pipeline output', () => {
    const plain = render(<BlobbiRenderer visual={VISUAL} instanceId="san-none" />);
    const identity = render(<BlobbiRenderer visual={VISUAL} instanceId="san-none" sanitize={(s) => s} />);
    expect(body(plain.container).innerHTML).toBe(body(identity.container).innerHTML);
  });
});
