import { makePromise } from './util';
import * as Promise from '@types/bluebird';

import {
    SelectCallback,
    TakeOperation,
    TakeManyOperation, Selectable, Source, Operation, OperationType
} from "./api";

export class Signal<T> implements Selectable<T>, Source<T> {
    private _selectTakes: SelectCallback<T>[] = [];
    private _selectTakeOps: (TakeOperation<T> | TakeManyOperation<T>)[] = [];
    private _connected: Signal<T>[] = [];
    private _resolve: (value: T) => void;
    private _reject: (error: any) => void;
    private _promise: Promise<T>;
    private _value: (T | undefined) = undefined;
    constructor() {
        const { resolve, reject, promise } = makePromise<T>();
        this._resolve = resolve;
        this._reject = reject;
        this._promise = promise;
    }

    isClosed(): boolean {
        return false;
    }

    isRaised(): boolean {
        return typeof this._value !== 'undefined';
    }

    canTakeSync(count: number) {
        if(!this.isRaised()) {
            return false;
        }
        else if(count === 1) {
            return true;
        }
        return false;
    }

    raise(value: T) {
        if(typeof value === 'undefined') {
            throw new Error('Cannot raise a signal with an undefined value');
        }
        this._value = value;
        this._resolve(value);
        while (this._selectTakes.length > 0) {
            const cb = <SelectCallback<T>>this._selectTakes.shift();
            const op = <Operation<T>>this._selectTakeOps.shift();
            cb(undefined, op);
        }
        for (let signal of this._connected) {
            signal.raise(value);
        }
        this._connected = [];
    }

    takeSync(): T {
        if (!this.isRaised()) {
            throw new Error('Cannot take immediate from un-raised signal');
        }
        return <T>this._value;
    }

    value(): T {
        if (!this.isRaised()) {
            throw new Error('Cannot get value from non-raised signal');
        }
        return <T>this._value;
    }

    take() {
        return this._promise;
    }

    connect(signal: Signal<T>) {
        if (this.isRaised()) {
            signal.raise(this.takeSync());
        }
        else {
            this._connected.push(signal);
        }
    }

    _select(op: TakeOperation<T>, cb: SelectCallback<T>): void {
        if(op.op === OperationType.TAKE) {
            if(this.isRaised()) {
                throw new Error('Cannot select for take on raised signal');
            }
            this._selectTakes.push(cb);
            this._selectTakeOps.push(op);
        }
        else {
            throw new Error('Only TAKE operation allowed on signals');
        }
    }

    _unselect(op: TakeOperation<T>): void {
        const index = this._selectTakeOps.indexOf(op);
        this._selectTakes.splice(index, 1);
        this._selectTakeOps.splice(index, 1);
    }

    _canSelectPutSync(count: number): boolean {
        throw new Error('Select PUT to Signal is not allowed');
    }
}
