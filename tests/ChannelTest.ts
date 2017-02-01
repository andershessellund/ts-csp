import {assert} from 'chai';
import {Channel} from "../src/Channel";
import {
    OperationType, PutOperation, TakeOperation, Operation, CLOSED,
    TakeManyOperation, PutManyOperation
} from "../src/api";
import {map, filter, take} from "transducers-js";

describe('Channel', () => {
    it('A channel is initially open', () => {
        const ch = new Channel(0);
        assert.isFalse(ch.isClosed());
    });

    it('I can put and take values synchronously', () => {
        const ch = new Channel(2);
        ch.putSync('foo');
        ch.putSync('bar');
        assert.strictEqual(ch.takeSync(), 'foo');
        assert.strictEqual(ch.takeSync(), 'bar');
    });

    it('I can putSync to a channel, even if the buffer overflows', () => {
        const ch = new Channel(2);
        assert(ch.canPutSync(2));
        ch.putSync('foo');
        assert.isFalse(ch.canPutSync(2));
        assert(ch.canPutSync(1));
        ch.putSync('bar');
        assert.isFalse(ch.canPutSync(1));
        ch.putSync('foobar');
        ch.takeSync();
        ch.takeSync();
        assert.isTrue(ch.canPutSync(1));
    });

    it('takeSync from an empty channel throws', () => {
        const ch = new Channel(0);
        assert.throws(() => ch.takeSync());
    });

    it('putManySync puts the specified items to the channel', () => {
        const ch = new Channel(3);
        ch.putManySync(['foo', 'bar']);
        assert.strictEqual(ch.takeSync(), 'foo');
        assert.strictEqual(ch.takeSync(), 'bar');
        assert.isFalse(ch.canTakeSync(1));
    });

    it('takeManySync takes the specified number of items from the channel', () => {
        const ch = new Channel(3);
        ch.putManySync(['foo', 'bar', 'foobar']);
        const result = ch.takeManySync(2);
        assert.deepEqual(result, ['foo', 'bar']);
    });

    it('takeManySync throws when the specified number of values is not available', () => {
        const ch = new Channel(2);
        ch.putManySync(['foo', 'bar']);
        assert.throws(() => ch.takeManySync(3));
    });

    it('Put and take works on unbuffered channel', () => {
        const ch = new Channel(0);
        const put = ch.put('foo');
        assert.isFalse(put.isFulfilled());
        const take = ch.take();
        assert(put.isFulfilled());
        assert(take.isFulfilled());
        assert.strictEqual('foo', take.value());
    });

    it('selectPut and take works on unbuffered channel', () => {
        const ch = new Channel(0);
        const putSpec: PutOperation = {
            ch,
            op: OperationType.PUT,
            value: 'foo'
        };
        let putCbCalled = false;
        const putCb = (err: any, spec: PutOperation) => {
            putCbCalled = true;
            ch._unselect(putSpec);
            assert.strictEqual(spec, putSpec);
            ch.putSync((spec).value);
        };

        ch._select(putSpec, putCb);
        assert(ch.canTakeSync(1));
        const promise = ch.take();
        assert(promise.isFulfilled());
        assert.strictEqual(promise.value(), 'foo');
        assert(putCbCalled);
    });


    it('selectTake and put works on unbuffered channel', () => {
        const ch = new Channel(0);
        const takeSpec: TakeOperation = {
            ch,
            op: OperationType.TAKE
        };

        let takeCbCalled = false;

        const takeCb = (err: any, spec: TakeOperation) => {
            takeCbCalled = true;
            ch._unselect(takeSpec);
            assert.strictEqual(spec, takeSpec);
            assert.strictEqual(ch.takeSync(), 'foo');
        };

        assert.isFalse(ch.canPutSync(1));
        ch._select(takeSpec, takeCb);
        assert(ch.canPutSync(1));
        const putPromise = ch.put('foo');
        assert(putPromise.isFulfilled());
        assert(takeCbCalled);
    });

    it('Put to an unbuffered channel is not fulfilled immediately', () => {
        const ch = new Channel(0);
        const p = ch.put('foo');
        assert.isFalse(p.isFulfilled());
        ch.takeSync();
        assert(p.isFulfilled());
    });

    it('If a channel is closed while a put is pending, the put is not resolved until a value is taken', () => {
        const ch = new Channel(0);
        const p = ch.put('foo');
        ch.close();
        assert.isFalse(p.isFulfilled());
        assert.strictEqual(ch.takeSync(), 'foo');
        assert.strictEqual(CLOSED, ch.takeSync());
    });

    it('selectPut on a channel which becomes closed results in the select being rejected', () => {
        const ch = new Channel(0);
        const putSpec: PutOperation = {
            ch,
            op: OperationType.PUT,
            value: 'foo'
        };
        let putCbCalled = false;
        const putCb = (err: any, spec: PutOperation) => {
            putCbCalled = true;
            assert.strictEqual(putSpec, spec);
            ch._unselect(putSpec);
            assert.instanceOf(err, Error);
        };

        ch._select(putSpec, putCb);
        ch.close();
        assert(putCbCalled);
    });

    it('If a taker is available, I can always selectPutSync, even if it causes overflow,', () => {
        const ch = new Channel(0);
        ch.take();
        assert(ch._canSelectPutSync(2));
    });

    it('If a select take is available, I can always selectPutSync, even if it causes overflow', () => {
        const ch = new Channel(0);
        assert.isFalse(ch._canSelectPutSync(2));
        const takeSpec: TakeManyOperation = {
            ch,
            op: OperationType.TAKE_MANY,
            count: 2
        };
        ch._select(takeSpec, () => null);
        assert(ch._canSelectPutSync(2));
    });

    it('If two selectTakes are pending, and items are only present for one, it will apply the correct one', () => {
        const ch = new Channel(0);
        const takeOneSpec: TakeOperation = {
            ch,
            op: OperationType.TAKE
        };
        const takeTwoSpec: TakeManyOperation = {
            ch,
            op: OperationType.TAKE_MANY,
            count: 2
        };
        let cbCalled = false;
        const cb = (err: any, spec: Operation) => {
            ch._unselect(spec);
            assert.strictEqual(spec, takeOneSpec);
            cbCalled = true;
        };
        ch._select(takeTwoSpec, cb);
        ch._select(takeOneSpec, cb);
        ch.putSync('foo');
        assert(cbCalled);
    });

    it('putMany puts the values to the channel, and is resolved when all values are in buffer', () => {
        const ch = new Channel(1);
        const p = ch.putMany(['foo', 'bar']);
        assert.isFalse(p.isFulfilled());
        assert.strictEqual(ch.takeSync(), 'foo');
        assert(p.isFulfilled());
        assert.strictEqual(ch.takeSync(), 'bar');
    });

    it('takeMany takes the values from the channel, and is not resolved until all values are available', () => {
        const ch = new Channel(1);
        ch.putSync('foo');
        const p = ch.takeMany(2);
        assert.isFalse(p.isFulfilled());
        ch.putSync('bar');
        assert(p.isFulfilled());
        assert.deepEqual(p.value(), ['foo', 'bar']);
    });

    it('takeMany is resolved when a channel is closed', () => {
        const ch = new Channel(1);
        const p = ch.takeMany(2);
        ch.close();
        assert(p.isFulfilled());
        assert.deepEqual(p.value(), [CLOSED]);
    });

    it('When takeMany is resolved due to channel close, remaining items are delivered as well', () => {
        const ch = new Channel(1);
        ch.putSync('foo');
        const p = ch.takeMany(2);
        assert.isFalse(p.isFulfilled());
        ch.close();
        assert(p.isFulfilled());
        assert.deepEqual(p.value(), ['foo', CLOSED]);
    });

    it('selectTake is applied when a channel is closed', () => {
        const ch = new Channel(0);
        const spec: TakeOperation = {
            ch,
            op: OperationType.TAKE
        };
        let cbCalled = false;
        const cb = (err: any, spec: TakeOperation) => {
            cbCalled = true;
            ch._unselect(spec);
            assert.strictEqual(ch.takeSync(), CLOSED);
        }
        ch._select(spec, cb);
        ch.close();
        assert(cbCalled);

    });

    it('Put to a closed channel throws', () => {
        const ch = new Channel(1);
        ch.close();
        assert.throws(() => ch.put('foo'));
        assert.throws(() => ch.putMany(['foo']));
        assert.throws(() => ch.putSync('foo'));
    });

    it('I can takeSync(2) when selectPutMany(2)', () => {
        const ch = new Channel(0);
        ch._select({op: OperationType.PUT_MANY, ch: ch, values: ['foo', 'bar']}, () => null);
        assert(ch.canTakeSync(2));
    });

    it('A select put many is applied when possible', () => {
        const ch = new Channel(1);
        const putManySpec: PutManyOperation = {
            op: OperationType.PUT_MANY,
            ch,
            values: ['foo', 'bar']
        };
        let cbCalled = false;
        const cb = (err: any, spec: PutManyOperation) => {
            cbCalled = true;
            assert.strictEqual(putManySpec, spec);
            ch._unselect(spec);
            ch.putManySync(spec.values);
        };
        ch._select(putManySpec, cb);
        assert.isFalse(cbCalled);
        ch.putSync('foobar');
        assert.strictEqual(ch.takeSync(), 'foobar');
        assert.isFalse(cbCalled);
        assert.strictEqual(ch.takeSync(), 'foo');
        assert(cbCalled);
    });

    it('Can specify a mapping transformation for channel', () => {
       const xform = map((i: number) => i+1);
       const ch = new Channel(1, xform);
       ch.putSync(0);
       assert.strictEqual(ch.takeSync(), 1);
    });

    it('Can specify a filtering transformation for channel', () => {
        const xform = filter((i: number) => i % 2 === 0);
        const ch = new Channel(10, xform);
        ch.putManySync([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for(let i = 0; i < 5; ++i) {
            assert.strictEqual(ch.takeSync(), i * 2);
        }
    });

    it('Can specify a short-circuiting transformation for channel', () => {
        const xform = take(5);
        const ch = new Channel(10, xform);
        ch.putManySync([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const result = ch.takeManySync(5);
        assert.deepEqual(result, [0, 1, 2, 3, 4]);
    });

    it('A short-circuiting channel is implicitly closed', () => {
        const xform = take(1);
        const ch = new Channel(1, xform);
        ch.putSync(1);
        ch.putSync(2);
        assert(ch.isClosed());
        ch.putSync(3);
        assert.strictEqual(ch.takeSync(), 1);
        assert.strictEqual(ch.takeSync(), CLOSED);
        ch.close();
    });

    it('Buffersize defaults to zero', ()=> {
       const ch = new Channel();
       const p = ch.put(1);
       assert.isFalse(p.isFulfilled());
    });

    it('Channel count number of puts', () => {
        const ch = new Channel();
        ch.put(1);
        ch.putMany([2,3]);
        ch.putSync(4);
        ch.putManySync([5, 6]);
        assert.strictEqual(ch.putCount(), 6);
    });

    it('When select take many on a channel, select puts are applied even if not enough items is available to satisfy select', () => {
       const ch = new Channel();
       const putSpec: PutManyOperation = { ch, op: OperationType.PUT_MANY, values: [1, 2]};
       let cbCalled = false;
       ch._select(putSpec, (err: any, spec: PutManyOperation) => {
           cbCalled = true;
           ch._unselect(spec);{}
       });
       ch._select({ch, op: OperationType.TAKE_MANY, count: 5}, (err, spec) => {
           ch._unselect(spec);
       });
       assert(cbCalled);
    });
});
