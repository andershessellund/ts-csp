import {assert} from 'chai';
import {select} from '../src/select';
import {Channel} from '../src/Channel';
import {
    TakeOperation, OperationType, SelectTakeResult, TakeManyOperation,
    SelectTakeManyResult, PutOperation, SelectPutResult, PutManyOperation, SelectPutManyResult
} from "../src/api";
describe('select', () => {
    it('selectTake completes immediately when value is available', () => {
        const ch = new Channel(1);
        ch.putSync('foo');
        const spec: TakeOperation = {
            ch,
            op: OperationType.TAKE
        };
        const p = select([spec]);
        assert(p.isFulfilled());
        const selectResult: SelectTakeResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.strictEqual(selectResult.value, 'foo');
    });
    it('selectTakeMany completes immediately when values are available', () => {
        const ch = new Channel(2);
        ch.putSync('foo');
        ch.putSync('bar');
        const spec: TakeManyOperation = {
            ch,
            op: OperationType.TAKE_MANY,
            count: 2
        };
        const p = select([spec]);
        assert(p.isFulfilled());
        const selectResult: SelectTakeManyResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.deepEqual(selectResult.values, ['foo', 'bar']);
    });
    it('selectPut completes immediately when taker is available', () => {
        const ch = new Channel(0);
        ch.take();
        const spec: PutOperation = {
            ch,
            op: OperationType.PUT,
            value: 'foo'
        };
        const p = select([spec]);
        assert(p.isFulfilled());
        const selectResult: SelectPutResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
    });
    it('selectPutMany completes immediately when taker is available', () => {
        const ch = new Channel(0);
        ch.take();
        const spec: PutManyOperation = {
            ch,
            op: OperationType.PUT_MANY,
            values: ['foo', 'bar']
        };
        const p = select([spec]);
        assert(p.isFulfilled());
        const selectResult: SelectPutManyResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
    });

    it('will throw if op is not valid', () => {
        const ch = new Channel(0);
        const spec: any = {
            ch: ch,
            op: 10
        };
        assert.throws(() => select([spec]));
    });

    it('async select takes completes when value becomes available', () => {
        const ch = new Channel(1);
        const spec: TakeOperation = {
            ch,
            op: OperationType.TAKE
        };
        const p = select([spec]);
        assert.isFalse(p.isFulfilled());
        ch.putSync('foo');
        assert(p.isFulfilled());
        const selectResult: SelectTakeResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.strictEqual(selectResult.value, 'foo');
    });

    it('async select take many completes when values becomes available', () => {
        const ch = new Channel(1);
        const spec: TakeManyOperation = {
            ch,
            op: OperationType.TAKE_MANY,
            count: 2
        };
        const p = select([spec]);
        assert.isFalse(p.isFulfilled());
        ch.putSync('foo');
        assert.isFalse(p.isFulfilled());
        ch.putSync('bar');
        assert(p.isFulfilled());
        const selectResult: SelectTakeManyResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.deepEqual(selectResult.values, ['foo', 'bar']);
    });

    it('async select put completes when buffer space is available', () => {
        const ch = new Channel(1);
        ch.putSync('foo');
        const spec: PutOperation = {
            ch,
            op: OperationType.PUT,
            value: 'bar'
        };
        const p = select([spec]);
        assert.isFalse(p.isFulfilled());
        assert.strictEqual(ch.takeSync(), 'foo');
        assert(p.isFulfilled());
        const selectResult: SelectPutResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.strictEqual(ch.takeSync(), 'bar');
    });
    it('async select put many completes when buffer space is available', () => {
        const ch = new Channel(2);
        ch.putSync('foo');
        const spec: PutManyOperation = {
            ch,
            op: OperationType.PUT_MANY,
            values: ['bar', 'foobar']
        };
        const p = select([spec]);
        assert.isFalse(p.isFulfilled());
        assert.strictEqual(ch.takeSync(), 'foo');
        assert(p.isFulfilled());
        const selectResult: SelectPutManyResult = <any>p.value();
        assert.strictEqual(selectResult.ch, ch);
        assert.strictEqual(ch.takeSync(), 'bar');
        assert.strictEqual(ch.takeSync(), 'foobar');
    });

    it('put select is rejected when channel becomes closed', () => {
        const ch = new Channel(0);
        const spec: PutOperation = {
            ch,
            op: OperationType.PUT,
            value: 'bar'
        };
        const p = select([spec]);
        assert.isFalse(p.isFulfilled());
        ch.close();
        assert(p.isRejected());
        p.catch(() => null);
    });

    it('Throws if argument is not an array', () => {
        assert.throws(() => select(<any>{}));
    });
    it('Throws if argument is an empty array', () => {
        assert.throws(() => select([]));
    });
    it('Throws if ch is not specified', () => {
        assert.throws(() => select(<any>[{op: OperationType.TAKE}]));
    });

    it('Throws if value is not specified for PUT', () => {
        const ch = new Channel(1);
        assert.throws(() => select(<any>[{ch, op: OperationType.PUT}]));
    });

    it('Throws if value is not specified for PUT_MANY', () => {
        const ch = new Channel(1);
        assert.throws(() => select(<any>[{ch, op: OperationType.PUT_MANY}]));
    });

    it('Throws if count is not specified for TAKE_MANY', () => {
        const ch = new Channel(1);
        assert.throws(() => select(<any>[{ch, op: OperationType.TAKE_MANY}]));
    });

    it('Throws if attempting to PUT_MANY with an undefined value', () => {
        const ch = new Channel(1);
        assert.throws(() => select(<any>[{ch, op: OperationType.PUT_MANY, values: ['foo', undefined]}]));
    });
});
