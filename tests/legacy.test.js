/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Legacy test placeholder', () => {
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('Legacy test placeholder', async () => {
    expect(true).toBe(true);
  });
});
