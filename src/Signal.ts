import { makePromise } from './util';
import * as Promise from 'bluebird';

import {
    SelectCallback,
    TakeOperation,
    TakeManyOperation, Selectable, Source, Operation, OperationType
} from "./api";
import {select} from "./select";

export class Signal implements Selectable, Source {
    private _selectTakes: SelectCallback[] = [];
    private _selectTakeOps: (TakeOperation | TakeManyOperation)[] = [];
    private _connected: Signal[] = [];
    private _resolve: (value: any) => void;
    private _reject: (error: any) => void;
    private _promise: Promise<any>;
    private _value: any = undefined;
    constructor() {
        const { resolve, reject, promise } = makePromise();
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

    raise(value: any) {
        if(typeof value === 'undefined') {
            throw new Error('Cannot raise a signal with an undefined value');
        }
        this._value = value;
        this._resolve(value);
        while (this._selectTakes.length > 0) {
            const cb = <SelectCallback>this._selectTakes.shift();
            const op = <Operation>this._selectTakeOps.shift();
            cb(undefined, op);
        }
        for (let signal of this._connected) {
            signal.raise(value);
        }
        this._connected = [];
    }

    takeSync(): any {
        if (!this.isRaised()) {
            throw new Error('Cannot take immediate from un-raised signal');
        }
        return this._value;
    }

    value(): any {
        if (!this.isRaised()) {
            throw new Error('Cannot get value from non-raised signal');
        }
        return this._value;
    }

    take() {
        return this._promise;
    }

    connect(signal: Signal) {
        if (this.isRaised()) {
            signal.raise(this.takeSync());
        }
        else {
            this._connected.push(signal);
        }
    }

    _select(op: TakeOperation, cb: SelectCallback): void {
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

    _unselect(op: TakeOperation): void {
        const index = this._selectTakeOps.indexOf(op);
        this._selectTakes.splice(index, 1);
        this._selectTakeOps.splice(index, 1);
    }

    _canSelectPutSync(count: number): boolean {
        throw new Error('Select PUT to Signal is not allowed');
    }
}

export const some = (...signals: Signal[]): Signal => {
    const result = new Signal();
    const selectSpec = signals.map(signal => (<TakeOperation>{
        ch: signal,
        op: OperationType.TAKE
    }));

    select(selectSpec).then(
        ({ ch, value }: { ch: Signal, value: any}) => result.raise( value ),
        err => {throw err}
    );
    return result;
};

export const all = (...signals: Signal[]): Signal => {
    const signal = new Signal();
    Promise.all(signals.map(s => s.take())).then(
        result => {
            signal.raise(result)
        },
        err => {
            throw err
        }
    );
    return signal;
};
