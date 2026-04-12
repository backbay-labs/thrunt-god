import { describe, it, expect } from 'vitest';
import {
  generateKillChainCanvas,
  generateDiamondCanvas,
  generateLateralMovementCanvas,
  generateHuntProgressionCanvas,
  TACTIC_ORDER,
  ENTITY_COLORS,
} from '../canvas-generator';
import type { CanvasEntity } from '../types';

describe('canvas-generator', () => {
  describe('TACTIC_ORDER constant', () => {
    it('has 14 entries from Reconnaissance to Impact', () => {
      expect(TACTIC_ORDER).toHaveLength(14);
      expect(TACTIC_ORDER[0]).toBe('Reconnaissance');
      expect(TACTIC_ORDER[13]).toBe('Impact');
    });
  });

  describe('ENTITY_COLORS constant', () => {
    it('maps entity type prefixes to hex colors', () => {
      expect(ENTITY_COLORS.ioc).toBe('#4a90d9');
      expect(ENTITY_COLORS.ttp).toBe('#d94a4a');
      expect(ENTITY_COLORS.actor).toBe('#9b59b6');
      expect(ENTITY_COLORS.tool).toBe('#e67e22');
    });
  });

  describe('generateKillChainCanvas', () => {
    it('produces canvas with zero nodes and zero edges for empty entities', () => {
      const result = generateKillChainCanvas([]);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('places a TTP entity with tactic "Execution" at column index 3 * 250 x-position', () => {
      const entity: CanvasEntity = {
        id: 'ttp-1',
        name: 'PowerShell',
        entityType: 'ttp',
        tactic: 'Execution',
      };
      const result = generateKillChainCanvas([entity]);
      expect(result.nodes).toHaveLength(1);
      const node = result.nodes[0];
      // Execution is index 3 in TACTIC_ORDER
      expect(node.x).toBe(3 * 250);
      expect(node.y).toBe(0);
      expect(node.width).toBe(200);
      expect(node.height).toBe(100);
      expect(node.color).toBe('#d94a4a');
    });

    it('places two IOC entities at column 0 with IOC color and dimensions', () => {
      const entities: CanvasEntity[] = [
        { id: 'ioc-1', name: '192.168.1.1', entityType: 'ioc/ip' },
        { id: 'ioc-2', name: 'evil.com', entityType: 'ioc/domain' },
      ];
      const result = generateKillChainCanvas(entities);
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].x).toBe(0);
      expect(result.nodes[0].color).toBe('#4a90d9');
      expect(result.nodes[0].width).toBe(150);
      expect(result.nodes[0].height).toBe(80);
      expect(result.nodes[1].x).toBe(0);
      expect(result.nodes[1].color).toBe('#4a90d9');
    });

    it('creates edges between entities in the same edge group', () => {
      const entities: CanvasEntity[] = [
        { id: 'ttp-1', name: 'PowerShell', entityType: 'ttp', tactic: 'Execution' },
        { id: 'ioc-1', name: '192.168.1.1', entityType: 'ioc/ip' },
      ];
      const edgeGroups = [{ entities: ['ttp-1', 'ioc-1'] }];
      const result = generateKillChainCanvas(entities, edgeGroups);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].fromNode).toBe('ttp-1');
      expect(result.edges[0].toNode).toBe('ioc-1');
    });
  });

  describe('generateDiamondCanvas', () => {
    it('positions actor entity at top quadrant (y < 0)', () => {
      const entity: CanvasEntity = {
        id: 'actor-1',
        name: 'APT29',
        entityType: 'actor',
      };
      const result = generateDiamondCanvas([entity]);
      const actorNode = result.nodes.find((n) => n.id === 'actor-1');
      expect(actorNode).toBeDefined();
      expect(actorNode!.y).toBeLessThan(0);
    });

    it('positions tool entity at right quadrant (x > 0, relative to center)', () => {
      const entity: CanvasEntity = {
        id: 'tool-1',
        name: 'Cobalt Strike',
        entityType: 'tool',
      };
      const result = generateDiamondCanvas([entity]);
      const toolNode = result.nodes.find((n) => n.id === 'tool-1');
      expect(toolNode).toBeDefined();
      // Tool at right quadrant, x > center (400)
      expect(toolNode!.x).toBeGreaterThan(400);
    });

    it('positions IOC entity at bottom quadrant (y > 0)', () => {
      const entity: CanvasEntity = {
        id: 'ioc-1',
        name: '192.168.1.1',
        entityType: 'ioc/ip',
      };
      const result = generateDiamondCanvas([entity]);
      const iocNode = result.nodes.find((n) => n.id === 'ioc-1');
      expect(iocNode).toBeDefined();
      expect(iocNode!.y).toBeGreaterThan(0);
    });

    it('produces zero nodes for empty entities (except center label)', () => {
      const result = generateDiamondCanvas([]);
      // Only the center label node
      const entityNodes = result.nodes.filter((n) => n.id !== 'diamond-center');
      expect(entityNodes).toHaveLength(0);
    });
  });

  describe('generateLateralMovementCanvas', () => {
    it('renders IOC entities as nodes with edges for co-occurring IOCs', () => {
      const entities: CanvasEntity[] = [
        { id: 'ioc-1', name: '192.168.1.1', entityType: 'ioc/ip' },
        { id: 'ioc-2', name: '10.0.0.1', entityType: 'ioc/ip' },
      ];
      const edgeGroups = [{ entities: ['ioc-1', 'ioc-2'] }];
      const result = generateLateralMovementCanvas(entities, edgeGroups);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].fromNode).toBe('ioc-1');
      expect(result.edges[0].toNode).toBe('ioc-2');
    });

    it('renders non-IOC entities in different positions than IOCs', () => {
      const entities: CanvasEntity[] = [
        { id: 'ioc-1', name: '192.168.1.1', entityType: 'ioc/ip' },
        { id: 'ttp-1', name: 'Lateral Tool Transfer', entityType: 'ttp' },
      ];
      const result = generateLateralMovementCanvas(entities);
      expect(result.nodes).toHaveLength(2);
      const iocNode = result.nodes.find((n) => n.id === 'ioc-1')!;
      const ttpNode = result.nodes.find((n) => n.id === 'ttp-1')!;
      // Non-IOC entities are positioned below IOCs
      expect(ttpNode.y).toBeGreaterThan(iocNode.y);
    });
  });

  describe('generateHuntProgressionCanvas', () => {
    it('orders entities vertically by index at x=200', () => {
      const entities: CanvasEntity[] = [
        { id: 'e-1', name: 'Entity A', entityType: 'ttp' },
        { id: 'e-2', name: 'Entity B', entityType: 'ioc/ip' },
        { id: 'e-3', name: 'Entity C', entityType: 'actor' },
      ];
      const result = generateHuntProgressionCanvas(entities);
      expect(result.nodes).toHaveLength(3);
      for (const node of result.nodes) {
        expect(node.x).toBe(200);
      }
      expect(result.nodes[0].y).toBeLessThan(result.nodes[1].y);
      expect(result.nodes[1].y).toBeLessThan(result.nodes[2].y);
    });

    it('creates sequential edges forming a timeline chain', () => {
      const entities: CanvasEntity[] = [
        { id: 'e-1', name: 'Entity A', entityType: 'ttp' },
        { id: 'e-2', name: 'Entity B', entityType: 'ioc/ip' },
        { id: 'e-3', name: 'Entity C', entityType: 'actor' },
      ];
      const result = generateHuntProgressionCanvas(entities);
      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].fromNode).toBe('e-1');
      expect(result.edges[0].toNode).toBe('e-2');
      expect(result.edges[1].fromNode).toBe('e-2');
      expect(result.edges[1].toNode).toBe('e-3');
    });
  });
});
