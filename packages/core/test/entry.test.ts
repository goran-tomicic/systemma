import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';

describe('entry point', () => {
  it('loads in every environment', () => {
    expect(core).toBeDefined();
  });
});
