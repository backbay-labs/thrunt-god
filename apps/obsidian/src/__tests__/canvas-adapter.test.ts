import { describe, it, expect } from 'vitest';
import {
  ENTITY_TYPE_COLORS,
  resolveEntityColor,
  patchCanvasNodeColors,
  mapVerdictToCssClass,
  computeConfidenceOpacity,
  buildEntityCssClasses,
  parseCanvasRelevantFields,
} from '../canvas-adapter';
import type { CanvasData } from '../types';

describe('canvas-adapter', () => {
  describe('ENTITY_TYPE_COLORS constant', () => {
    it('has 6 base entity type keys', () => {
      expect(Object.keys(ENTITY_TYPE_COLORS)).toHaveLength(6);
    });

    it('maps ioc to red #e53935', () => {
      expect(ENTITY_TYPE_COLORS['ioc']).toBe('#e53935');
    });

    it('maps ttp to orange #fb8c00', () => {
      expect(ENTITY_TYPE_COLORS['ttp']).toBe('#fb8c00');
    });

    it('maps actor to purple #8e24aa', () => {
      expect(ENTITY_TYPE_COLORS['actor']).toBe('#8e24aa');
    });

    it('maps tool to blue #1e88e5', () => {
      expect(ENTITY_TYPE_COLORS['tool']).toBe('#1e88e5');
    });

    it('maps infrastructure to green #43a047', () => {
      expect(ENTITY_TYPE_COLORS['infrastructure']).toBe('#43a047');
    });

    it('maps datasource to gray #757575', () => {
      expect(ENTITY_TYPE_COLORS['datasource']).toBe('#757575');
    });
  });

  describe('resolveEntityColor', () => {
    it('returns #e53935 for ioc/ip', () => {
      expect(resolveEntityColor('ioc/ip')).toBe('#e53935');
    });

    it('returns #e53935 for ioc/domain', () => {
      expect(resolveEntityColor('ioc/domain')).toBe('#e53935');
    });

    it('returns #e53935 for ioc/hash', () => {
      expect(resolveEntityColor('ioc/hash')).toBe('#e53935');
    });

    it('returns #fb8c00 for ttp', () => {
      expect(resolveEntityColor('ttp')).toBe('#fb8c00');
    });

    it('returns #8e24aa for actor', () => {
      expect(resolveEntityColor('actor')).toBe('#8e24aa');
    });

    it('returns #1e88e5 for tool', () => {
      expect(resolveEntityColor('tool')).toBe('#1e88e5');
    });

    it('returns #43a047 for infrastructure', () => {
      expect(resolveEntityColor('infrastructure')).toBe('#43a047');
    });

    it('returns #757575 for datasource', () => {
      expect(resolveEntityColor('datasource')).toBe('#757575');
    });

    it('returns #757575 for unknown_type (fallback)', () => {
      expect(resolveEntityColor('unknown_type')).toBe('#757575');
    });
  });

  describe('patchCanvasNodeColors', () => {
    const makeCanvasData = (nodes: CanvasData['nodes'], edges: CanvasData['edges'] = []): CanvasData => ({
      nodes,
      edges,
    });

    it('updates color and returns changedCount=1 for one matching file-node', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 10, y: 20, width: 400, height: 300, type: 'file', file: 'entities/iocs/192.168.1.1.md', color: '#000000' },
      ]);
      const colorMap = new Map([['entities/iocs/192.168.1.1.md', '#e53935']]);
      const { patched, changedCount } = patchCanvasNodeColors(data, colorMap);
      expect(changedCount).toBe(1);
      expect(patched.nodes[0]!.color).toBe('#e53935');
    });

    it('returns changedCount=0 and identical data with no matching nodes', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 10, y: 20, width: 400, height: 300, type: 'file', file: 'entities/iocs/other.md', color: '#000000' },
      ]);
      const colorMap = new Map([['entities/iocs/192.168.1.1.md', '#e53935']]);
      const { patched, changedCount } = patchCanvasNodeColors(data, colorMap);
      expect(changedCount).toBe(0);
      expect(patched.nodes[0]!.color).toBe('#000000');
    });

    it('preserves x, y, width, height, id of matching nodes', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 100, y: 200, width: 400, height: 300, type: 'file', file: 'entities/iocs/test.md', color: '#000' },
      ]);
      const colorMap = new Map([['entities/iocs/test.md', '#e53935']]);
      const { patched } = patchCanvasNodeColors(data, colorMap);
      const node = patched.nodes[0]!;
      expect(node.id).toBe('n1');
      expect(node.x).toBe(100);
      expect(node.y).toBe(200);
      expect(node.width).toBe(400);
      expect(node.height).toBe(300);
    });

    it('does not modify text-type nodes even if colorMap has a matching key', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'text', text: 'notes', color: '#000' },
      ]);
      // Text nodes don't have file property, but let's ensure they aren't touched
      const colorMap = new Map([['notes', '#e53935']]);
      const { patched, changedCount } = patchCanvasNodeColors(data, colorMap);
      expect(changedCount).toBe(0);
      expect(patched.nodes[0]!.color).toBe('#000');
    });

    it('does not modify edges array', () => {
      const edges = [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'test' }];
      const data = makeCanvasData(
        [{ id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: 'f.md', color: '#000' }],
        edges,
      );
      const colorMap = new Map([['f.md', '#e53935']]);
      const { patched } = patchCanvasNodeColors(data, colorMap);
      expect(patched.edges).toHaveLength(1);
      expect(patched.edges[0]!.id).toBe('e1');
      expect(patched.edges[0]!.label).toBe('test');
    });

    it('patches all matching nodes when multiple match', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: 'a.md', color: '#000' },
        { id: 'n2', x: 10, y: 10, width: 200, height: 100, type: 'file', file: 'b.md', color: '#111' },
      ]);
      const colorMap = new Map([
        ['a.md', '#e53935'],
        ['b.md', '#fb8c00'],
      ]);
      const { patched, changedCount } = patchCanvasNodeColors(data, colorMap);
      expect(changedCount).toBe(2);
      expect(patched.nodes[0]!.color).toBe('#e53935');
      expect(patched.nodes[1]!.color).toBe('#fb8c00');
    });

    it('returns changedCount=0 if color is already correct (no-op optimization)', () => {
      const data = makeCanvasData([
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: 'a.md', color: '#e53935' },
      ]);
      const colorMap = new Map([['a.md', '#e53935']]);
      const { patched, changedCount } = patchCanvasNodeColors(data, colorMap);
      expect(changedCount).toBe(0);
      expect(patched.nodes[0]!.color).toBe('#e53935');
    });
  });

  describe('mapVerdictToCssClass', () => {
    it('maps "unknown" to "thrunt-verdict-unknown"', () => {
      expect(mapVerdictToCssClass('unknown')).toBe('thrunt-verdict-unknown');
    });

    it('maps "suspicious" to "thrunt-verdict-suspicious"', () => {
      expect(mapVerdictToCssClass('suspicious')).toBe('thrunt-verdict-suspicious');
    });

    it('maps "confirmed_malicious" to "thrunt-verdict-confirmed-malicious"', () => {
      expect(mapVerdictToCssClass('confirmed_malicious')).toBe('thrunt-verdict-confirmed-malicious');
    });

    it('maps "remediated" to "thrunt-verdict-remediated"', () => {
      expect(mapVerdictToCssClass('remediated')).toBe('thrunt-verdict-remediated');
    });

    it('maps "resurfaced" to "thrunt-verdict-resurfaced"', () => {
      expect(mapVerdictToCssClass('resurfaced')).toBe('thrunt-verdict-resurfaced');
    });

    it('maps empty string to "thrunt-verdict-unknown" (default)', () => {
      expect(mapVerdictToCssClass('')).toBe('thrunt-verdict-unknown');
    });

    it('maps unrecognized verdict to "thrunt-verdict-unknown"', () => {
      expect(mapVerdictToCssClass('nonsense')).toBe('thrunt-verdict-unknown');
    });
  });

  describe('computeConfidenceOpacity', () => {
    it('returns 0.3 for confidence 0', () => {
      expect(computeConfidenceOpacity(0)).toBeCloseTo(0.3);
    });

    it('returns 1.0 for confidence 1', () => {
      expect(computeConfidenceOpacity(1)).toBeCloseTo(1.0);
    });

    it('returns 0.65 for confidence 0.5', () => {
      expect(computeConfidenceOpacity(0.5)).toBeCloseTo(0.65);
    });

    it('returns 1.0 for undefined (default for missing score)', () => {
      expect(computeConfidenceOpacity(undefined)).toBeCloseTo(1.0);
    });

    it('clamps to 0.3 minimum for negative values', () => {
      expect(computeConfidenceOpacity(-0.5)).toBeCloseTo(0.3);
    });

    it('clamps to 1.0 maximum for values above 1', () => {
      expect(computeConfidenceOpacity(1.5)).toBeCloseTo(1.0);
    });
  });

  describe('buildEntityCssClasses', () => {
    it('returns array containing verdict class and confidence class', () => {
      const classes = buildEntityCssClasses('suspicious', 0.7);
      expect(classes).toContain('thrunt-verdict-suspicious');
      expect(classes.some(c => c.startsWith('thrunt-confidence-'))).toBe(true);
    });

    it('returns confidence-low for score < 0.4', () => {
      const classes = buildEntityCssClasses('unknown', 0.2);
      expect(classes).toContain('thrunt-confidence-low');
    });

    it('returns confidence-medium for score 0.4-0.7', () => {
      const classes = buildEntityCssClasses('unknown', 0.5);
      expect(classes).toContain('thrunt-confidence-medium');
    });

    it('returns confidence-high for score > 0.7', () => {
      const classes = buildEntityCssClasses('unknown', 0.9);
      expect(classes).toContain('thrunt-confidence-high');
    });

    it('returns confidence-high for undefined score (defaults to full confidence)', () => {
      const classes = buildEntityCssClasses('unknown', undefined);
      expect(classes).toContain('thrunt-confidence-high');
    });
  });

  describe('parseCanvasRelevantFields', () => {
    it('extracts type, verdict, and confidence_score from frontmatter', () => {
      const content = `---
type: ioc/ip
verdict: suspicious
confidence_score: 0.75
---
# Test Entity
`;
      const result = parseCanvasRelevantFields(content);
      expect(result.type).toBe('ioc/ip');
      expect(result.verdict).toBe('suspicious');
      expect(result.confidenceScore).toBe(0.75);
    });

    it('returns empty type and unknown verdict for missing frontmatter', () => {
      const content = '# No Frontmatter';
      const result = parseCanvasRelevantFields(content);
      expect(result.type).toBe('');
      expect(result.verdict).toBe('');
      expect(result.confidenceScore).toBeUndefined();
    });

    it('handles frontmatter with missing confidence_score', () => {
      const content = `---
type: ttp
verdict: confirmed_malicious
---
# TTP
`;
      const result = parseCanvasRelevantFields(content);
      expect(result.type).toBe('ttp');
      expect(result.verdict).toBe('confirmed_malicious');
      expect(result.confidenceScore).toBeUndefined();
    });

    it('strips quotes from frontmatter values', () => {
      const content = `---
type: "actor"
verdict: 'remediated'
confidence_score: 0.5
---
`;
      const result = parseCanvasRelevantFields(content);
      expect(result.type).toBe('actor');
      expect(result.verdict).toBe('remediated');
    });
  });
});
