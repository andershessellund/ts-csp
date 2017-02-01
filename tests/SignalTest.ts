import {assert} from "chai";

import {Signal} from "../src/Signal";
import {OperationType, SelectCallback, TakeOperation, PutOperation} from "../src/api";

describe('Signal', () => {
    it('Is initially not raised', () => {
        const s = new Signal();
        assert(!s.isRaised());
    });

    it('Throws when takeSync from non-raised signal', () => {
        const s = new Signal();
        assert.throws(() => s.takeSync());
    });

    it('Throws when retrieving value from non-raised signal', () => {
        const s = new Signal();
        assert.throws(() => s.value());
    });

    it('Raising undefined value raises null instead', () => {
        const s = new Signal();
        s.raise();
        assert.isNull(s.value());
    });

    it('A signal can be raised and the value retrieved', () => {
        const s = new Signal();
        s.raise('foo');
        assert.strictEqual(s.value(), 'foo');
    });

    it('A signal can be raised with a value of null', () => {
        const s = new Signal();
        s.raise(null);
        assert.strictEqual(s.value(), null);
        assert(s.isRaised());
    });

    it('When a signal is raised with a value, all takes will be resolved with that value', () => {
        const s = new Signal();
        const p1 = s.take();
        const p2 = s.take();
        assert.isFalse(p1.isFulfilled());
        s.raise('foo');
        assert(p1.isFulfilled());
        assert(p2.isFulfilled());
        assert.strictEqual(p1.value(), 'foo');
        assert.strictEqual(p2.value(), 'foo');
    });

    it('A take from a raised signal is resolved immediately', () => {
        const s = new Signal();
        s.raise('foo');
        const p = s.take();
        assert(p.isFulfilled());
        assert.strictEqual(p.value(), 'foo');
    });

    it('canTakeSync(1) returns whether a signal is raised', () => {
        const s = new Signal();
        assert.isFalse(s.canTakeSync(1));
        s.raise('foo');
        assert.isTrue(s.canTakeSync(1));
    });

    it('Select on signal obeys expected behavior', () => {
        const s = new Signal();
        const spec: TakeOperation = {
            ch: s,
            op: OperationType.TAKE,
        };
        let callbackCalled = false;
        const cb: SelectCallback = (err, _spec) => {
            callbackCalled = true;
            assert.isUndefined(err);
            assert.strictEqual(spec, _spec);
        };
        s._select(spec, cb);
        assert.isFalse(callbackCalled);
        s.raise('foo');
        assert(callbackCalled);
    });

    it('A signal is never closed', () => {
        const s = new Signal();
        assert.isFalse(s.isClosed());
        s.raise('foo');
        assert.isFalse(s.isClosed());
    });

    it('I can only take 1 value from a signal', () => {
       const s = new Signal();
       s.raise('foo');
       assert.isFalse(s.canTakeSync(2));
    });

    it('I can synchronously take a value from a raised signal', () => {
        const s = new Signal();
        s.raise('foo');
        assert.strictEqual(s.takeSync(), 'foo');
    });

    it('Throws if i try to select on a raised signal', () => {
        const s = new Signal();
        s.raise('foo');
        const op: TakeOperation = {
            ch: s,
            op: OperationType.TAKE
        };
        const cb = () => null;
        assert.throws(() => s._select(op, cb));
    });

    it('Throws if i try to select on a signal with a different operation than TAKE', () => {
        const s = new Signal();
        s.raise('foo');
        const op = {
            ch: s,
            op: OperationType.PUT,
            value: 'foo'
        };
        const cb = () => null;
        assert.throws(() => s._select(<TakeOperation>op, cb));
    });

    it('_unselect removes a select', () => {
        const s = new Signal();
        const spec: TakeOperation = {
            ch: s,
            op: OperationType.TAKE
        };
        let callbackCalled = false;
        const cb = () => callbackCalled = true;
        s._select(spec, cb);
        s._unselect(spec);
        s.raise('foo');
        assert.isFalse(callbackCalled);
    });

    it('canSelectPutSync throws', () => {
        const s = new Signal();
        assert.throws(() => s._canSelectPutSync(1));
    });

    it('When raising a signal, all connected signals are raised too', () => {
        const s = new Signal();
        const s1 = new Signal();
        const s2 = new Signal();
        s.connect(s1);
        s.connect(s2);
        s.raise('foo');
        assert(s1.isRaised());
        assert(s2.isRaised());
        assert.strictEqual(s1.value(), 'foo');
    });

    it('Connecting an already raised signal raises the connected signal immediately', () => {
        const s = new Signal();
        const s1 = new Signal();
        s.raise('foo');
        s.connect(s1);
        assert(s1.isRaised());
    });

    it('I can disconnect a signal', () => {
       const s = new Signal();
       const s2 = new Signal();
       s.connect(s2);
       s.disconnect(s2);
       s.raise(null);
       assert.isFalse(s2.isRaised());
    });
});
