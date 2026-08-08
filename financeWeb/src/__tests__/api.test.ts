import { describe, it, expect } from 'vitest';
import { fetchRecords, fetchCategoryTree, fetchFanzongs, fetchFanzongCategories } from '../services/api';

describe('API Service', () => {
  it('returns records', async () => {
    const records = await fetchRecords();
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });

  it('returns category tree', async () => {
    const tree = await fetchCategoryTree();
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
  });

  it('returns fanzongs', async () => {
    const fanzongs = await fetchFanzongs();
    expect(Array.isArray(fanzongs)).toBe(true);
    expect(fanzongs.length).toBeGreaterThan(0);
  });

  it('returns fanzong categories', async () => {
    const categories = await fetchFanzongCategories();
    expect(typeof categories).toBe('object');
    expect(Object.keys(categories).length).toBeGreaterThan(0);
  });
});
