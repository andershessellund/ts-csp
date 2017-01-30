import { assert } from "chai";

import FifoQueue from '../src/FifoQueue'

describe('FifoQueue', () => {
   it('Will throw when popping from empty queue', () => {
      const q = new FifoQueue();
      assert.throws(() => q.pop());
   });

   it('unshift, unshift, pop, unshift, pop, pop works as expected', () => {
       const q = new FifoQueue();
       q.unshift(0);
       q.unshift(1);
       assert.strictEqual(q.pop(), 0);
       q.unshift(2);
        assert.strictEqual(q.pop(), 1);
        assert.strictEqual(q.pop(), 2);
    });

   it('popMany works', () => {
      const q = new FifoQueue();
       q.unshift(0);
       q.unshift(1);
       const r = q.popMany(2);
       assert.deepEqual(r, [0, 1]);
   });

   it('popMany throws when there is not enough items in queue', () => {
       const q = new FifoQueue();
       q.unshift(0);
       q.unshift(1);
       assert.throws(() => q.popMany(3));
   });

    it('unshiftMany works', () => {
        const q = new FifoQueue();
        q.unshiftMany([0, 1]);
        const r = q.popMany(2);
        assert.deepEqual(r, [0, 1]);
    });

    it('correctly computes length', () => {
        const q = new FifoQueue();
        q.unshift(0);
        q.unshift(1);
        q.pop();
        q.unshift(2);
        assert.strictEqual(q.length(), 2);
    });
});
