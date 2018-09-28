import * as Promise from 'bluebird';
import { assert } from 'chai';

import {go} from '../src/go';
import {Channel} from "../src/Channel";
import {select} from "../src/select";
import {OperationType, Abort, Process} from "../src/api";
import {Signal} from "../src/Signal";

describe('go', () => {
    it('The abortSignal is present on this', () => {
       return go(function*() {
           assert.instanceOf(this.abortSignal, Signal);
           yield Promise.resolve(1);
       }).asPromise();
    });
    it('May run a successful process and return a value', () => {
        return Promise.coroutine(function*(): any {
            const ch = new Channel(0);
            const process = go(function*() {
                return yield ch.take();
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            ch.putSync('foo');
            const completedResult = yield process.completed.take();
            assert.deepEqual(completedResult, { succeeded: 'foo'});
            assert.strictEqual(process.succeeded.value(), 'foo');
            assert.isFalse(process.failed.isRaised());
        })();
    });

    it('A process may abort by returning Abort if the abort signal is raised', () => {
        return Promise.coroutine(function*(): any {
            const ch = new Channel(0);
            const process = go(function*() {
                const {ch: selectedChannel} = yield select([
                    {ch, op: OperationType.TAKE},
                    {ch: this.abortSignal, op: OperationType.TAKE }
                ]);
                if(selectedChannel === this.abortSignal) {
                    return new Abort(this.abortSignal.value());
                }
                else {
                    throw new Error();
                }
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            assert.isFalse(process.failed.isRaised());
            process.abort.raise('abort reason');
            const completedResult = yield process.completed.take();
            assert.instanceOf(completedResult.failed, Abort);
            assert.strictEqual('abort reason', completedResult.failed.reason);
            const failedResult = process.failed.value();
            assert.instanceOf(failedResult, Abort);
            assert.strictEqual('abort reason', failedResult.reason);
        })();
    });

    it('A process may abort by throwing Abort if the abort signal is raised', () => {
        return Promise.coroutine(function*(): any {
            const process = go(function*() {
                const reason = yield this.abortSignal.take();
                throw new Abort(reason);
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            assert.isFalse(process.failed.isRaised());
            process.abort.raise('abort reason');
            const result = yield process.failed.take();
            assert.instanceOf(result, Abort);
            assert.strictEqual(result.reason, 'abort reason');
        })();
    });

    it('If a process generator returns undefined, the process returns null', () => {
        return Promise.coroutine(function*() {
            const process = go(function*() {
                yield Promise.resolve(null);
            });
            assert.isNull((yield process.succeeded.take()));
        })();
    });

    it('Yielding a succeeding process gives the return value of the process', () => {
        return go(function*() {
            const value =  yield go(function*() {
               return yield Promise.resolve('foo');
            });
            assert.strictEqual(value, 'foo');
        }).asPromise();
    });

    it('Yielding a aborting process throws an abort', () => {
        return go(function*() {
            const ch = new Channel();
            const proc =  go(function*() {
                return yield this.takeOrAbort(ch);
            });
            proc.abort.raise('aborted');
            try {
                yield proc;
                assert.fail('Should have thrown');
            }
            catch(err) {
                assert.instanceOf(err, Abort);
            }
        }).asPromise();
    });

    it('Yielding an erroring process throws the error', () => {
        return go(function*() {
            try {
                yield go(function*() {
                    return yield Promise.reject('foo');
                });
                assert.fail('Should have thrown');
            }
            catch(err) {
                assert.strictEqual(err, 'foo');
            }
        }).asPromise();
    });

    it('If abort is not raised, the select will work as usual', () => {
        return Promise.coroutine(function*() {
            const ch = new Channel(0);
            const process = go(function*() {
                const selectResult = yield this.selectOrAbort([
                    { ch, op: OperationType.TAKE}
                ]);
                if(selectResult.ch === ch) {
                    return selectResult.value;
                }
            });
            ch.putSync('foo');
            yield process.completed.take();
            assert.strictEqual(process.succeeded.value(), 'foo');
        })();
    });


    it('If abortSignal is raised, Abort will be thrown wil appropriate reason', () => {
        return Promise.coroutine(function*() {
            const ch = new Channel(0);
            const process = go(function*() {
                const selectResult = yield this.selectOrAbort([
                    { ch, op: OperationType.TAKE}
                ]);
                if(selectResult.ch === ch) {
                    return selectResult.value;
                }
            });
            process.abort.raise('Aborted');
            ch.putSync('foo');
            yield process.completed.take();
            const error = process.failed.value();
            assert.instanceOf(error, Abort);
            assert.strictEqual(error.reason, 'Aborted');
        })();
    });


    it('Can delegate abort signal to process', () => {
        return go(function*() {
            let childProc: Process | undefined = undefined;
            const abortedProc = go(function*() {
                const ch = new Channel();
                childProc = this.delegateAbort(go(function*() {
                    return yield this.takeOrAbort(ch);
                }));
                try {
                    yield childProc;
                    assert.fail('Should have thrown');
                }
                catch (err) {
                    assert.instanceOf(err, Abort);
                    throw err;
                }
            });
            abortedProc.abort.raise('aborted');
            try {
                yield abortedProc;
                assert.fail('Should have thrown');
            }
            catch(err) {
                assert.instanceOf(err, Abort);
                assert.strictEqual(err.reason, 'aborted');
            }
            const completedChildProc: Process = <any>childProc;
            assert.instanceOf(completedChildProc.failed.value(), Abort);
            assert.strictEqual(completedChildProc.failed.value().reason, 'aborted');
        }).asPromise();
    });

    it('When delegating abort signal, the signal is disconnected upon process completion', () => {
        return go(function*() {
            const abortSignal = new Signal();
            const proc = this.delegateAbort(go(function*() {
                return yield Promise.resolve(1);
            }));
            yield proc;
            yield Promise.delay(0);
            abortSignal.raise('aborted');
            assert.isFalse(proc.abort.isRaised());
        }).asPromise();
    });

});
