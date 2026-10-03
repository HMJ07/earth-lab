import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SimClock } from '../src/core/Clock';
import type { Layer, PickResult } from '../src/core/Layer';
import { LayerManager } from '../src/core/LayerManager';

function fakeLayer(id: string, overrides: Partial<Layer> = {}): Layer & { loads: number } {
  const layer = {
    id,
    label: id,
    description: '',
    color: '#fff',
    timeAware: true,
    attribution: { name: 'x', url: 'https://x' },
    loads: 0,
    load: vi.fn(async () => {
      layer.loads++;
    }),
    update: vi.fn(),
    pick: vi.fn(() => null),
    status: () => '',
    dispose: vi.fn(),
    ...overrides,
  };
  return layer as unknown as Layer & { loads: number };
}

function setup() {
  const parent = new Group();
  const manager = new LayerManager({
    parent,
    clock: new SimClock(),
    camera: new PerspectiveCamera(),
    pixelRatio: () => 1,
  });
  return { parent, manager };
}

const hit = (layerId: string, distancePx: number): PickResult => ({
  layerId,
  id: 'i',
  distancePx,
  title: 't',
  color: '#fff',
  lat: 0,
  lon: 0,
  rows: [],
});

const frame = { time: 0, dt: 0.016, elapsed: 0, live: true, camera: new PerspectiveCamera() };
const query = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  camera: new PerspectiveCamera(),
  radiusPx: 10,
  time: 0,
};

describe('LayerManager', () => {
  it('loads lazily on first enable, only once', async () => {
    const { manager } = setup();
    const layer = fakeLayer('a');
    manager.register(layer);

    expect(layer.loads).toBe(0);
    await manager.setEnabled('a', true);
    await manager.setEnabled('a', false);
    await manager.setEnabled('a', true);

    expect(layer.loads).toBe(1);
    expect(manager.get('a')!.state).toBe('ready');
  });

  it('shows the layer group only while enabled and ready', async () => {
    const { manager } = setup();
    manager.register(fakeLayer('a'));
    const entry = manager.get('a')!;
    expect(entry.group.visible).toBe(false);

    await manager.setEnabled('a', true);
    expect(entry.group.visible).toBe(true);

    await manager.setEnabled('a', false);
    expect(entry.group.visible).toBe(false);
  });

  it('records load failures and can retry', async () => {
    const { manager } = setup();
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    manager.register(fakeLayer('a', { load }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await manager.setEnabled('a', true);
    expect(manager.get('a')).toMatchObject({ state: 'error', error: 'boom' });

    await manager.retry('a');
    expect(manager.get('a')!.state).toBe('ready');
  });

  it('only updates enabled, ready layers', async () => {
    const { manager } = setup();
    const on = fakeLayer('on');
    const off = fakeLayer('off');
    manager.register(on);
    manager.register(off);
    await manager.setEnabled('on', true);

    manager.update(frame);
    expect(on.update).toHaveBeenCalledTimes(1);
    expect(off.update).not.toHaveBeenCalled();
  });

  it('picks the closest hit across layers and ignores disabled ones', async () => {
    const { manager } = setup();
    manager.register(fakeLayer('far', { pick: () => hit('far', 9) }));
    manager.register(fakeLayer('near', { pick: () => hit('near', 3) }));
    manager.register(fakeLayer('off', { pick: () => hit('off', 1) }));
    await manager.setEnabled('far', true);
    await manager.setEnabled('near', true);

    expect(manager.pick(query)?.layerId).toBe('near');
  });

  it('notifies layers about selection changes', async () => {
    const { manager } = setup();
    const a = fakeLayer('a', { select: vi.fn() });
    const b = fakeLayer('b', { select: vi.fn() });
    manager.register(a);
    manager.register(b);

    manager.select(hit('a', 0), null);
    expect(a.select).toHaveBeenLastCalledWith('i');

    manager.select(hit('b', 0), hit('a', 0));
    expect(a.select).toHaveBeenLastCalledWith(null);
    expect(b.select).toHaveBeenLastCalledWith('i');

    manager.select(null, hit('b', 0));
    expect(b.select).toHaveBeenLastCalledWith(null);
  });

  it('emits change events and rejects duplicate ids', async () => {
    const { manager } = setup();
    const changes: string[] = [];
    manager.changed.on((e) => changes.push(`${e.layer.id}:${e.state}`));
    manager.register(fakeLayer('a'));
    await manager.setEnabled('a', true);

    expect(changes).toEqual(['a:idle', 'a:loading', 'a:ready']);
    expect(() => manager.register(fakeLayer('a'))).toThrow(/Duplicate/);
  });

  it('disposes every layer', async () => {
    const { manager, parent } = setup();
    const layer = fakeLayer('a');
    manager.register(layer);
    manager.dispose();
    expect(layer.dispose).toHaveBeenCalled();
    expect(parent.children).toHaveLength(0);
  });
});
