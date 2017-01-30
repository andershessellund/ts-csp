import { assert } from 'chai';
import * as Promise from 'bluebird';
import {Channel} from "../src/Channel";
import {go} from "../src/go";
import {selectOrAbort} from "../src/selectOrAbort";
import {OperationType, Abort} from "../src/api";
import {Signal} from "../src/Signal";

describe('selectOrAbort', () => {
   it('If abort is not raised, the select will work as usual', () => {
      return Promise.coroutine(function*() {
          const ch = new Channel<string>(0);
          const process = go(function*(abortSignal: Signal<string>) {
              const selectResult = yield selectOrAbort(abortSignal, [
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
            const ch = new Channel<string>(0);
            const process = go(function*(abortSignal: Signal<string>) {
                const selectResult = yield selectOrAbort(abortSignal, [
                    { ch, op: OperationType.TAKE}
                ]);
                if(selectResult.ch === ch) {
                    return selectResult.value;
                }
            });
            process.abort.raise('Aborted');
            ch.putSync('foo', true);
            yield process.completed.take();
            const error = process.failed.value();
            assert.instanceOf(error, Abort);
            assert.strictEqual(error.reason, 'Aborted');
        })();
    });
});
