import * as Promise from 'bluebird';

import {
    OperationType,
    Operation,
    SelectResult
} from './api';

export const select = function (selectSpec: Operation[]): Promise<SelectResult> {
    if(!Array.isArray(selectSpec) || selectSpec.length === 0) {
        throw new Error('must specify at least one spec');
    }
    for(const spec of selectSpec) {
        if(!spec.ch) {
            throw new Error('Must specify channel for select');
        }
        if(spec.op === OperationType.TAKE) {
            // OK
        }
        else if(spec.op === OperationType.TAKE_MANY) {
            if(typeof spec.count !== 'number') {
                throw new Error(' Invalid count for TAKE_MANY: ' + spec.count);
            }
        }
        else if(spec.op === OperationType.PUT) {
            if(typeof spec.value === 'undefined') {
                throw new Error('Cannot put an undefined value');
            }
        }
        else if(spec.op === OperationType.PUT_MANY) {
            if(!Array.isArray(spec.values)) {
                throw new Error('For PUT_MANY, values must be an array');
            }
            for(let item of spec.values) {
                if(typeof item === 'undefined') {
                    throw new Error('Cannot put undefined to a channel');
                }
            }
        }
        else {
            throw new Error('Invalid op: ' + (<any>spec).op);
        }
    }
    for (const spec of selectSpec) {
        if(spec.op === OperationType.TAKE && spec.ch.canTakeSync(1)) {
            const value = spec.ch.takeSync();
            return Promise.resolve({ ch: spec.ch, value });
        }
        else if(spec.op === OperationType.TAKE_MANY && spec.ch.canTakeSync(spec.count)) {
            const values = spec.ch.takeManySync(spec.count);
            return Promise.resolve({ ch: spec.ch, values})
        }
        else if(spec.op === OperationType.PUT && spec.ch._canSelectPutSync(1)) {
            spec.ch.putSync(spec.value);
            return Promise.resolve({
                ch: spec.ch
            });
        }
        else if(spec.op === OperationType.PUT_MANY && spec.ch._canSelectPutSync(spec.values.length)) {
            spec.ch.putManySync(spec.values, true);
            return Promise.resolve({
                ch: spec.ch
            });
        }
    }
    return new Promise<SelectResult>((resolve, reject) => {
        const cb = (err: any, selectedSpec: Operation) => {
            for(const spec of selectSpec) {
                spec.ch._unselect(spec);
            }
            if (err) {
                reject(err);
            }
            else if (selectedSpec.op === OperationType.TAKE) {
                resolve({ch: selectedSpec.ch, value: selectedSpec.ch.takeSync()});
            }
            else if (selectedSpec.op === OperationType.TAKE_MANY) {
                const {ch, count} = selectedSpec;
                const values = ch.takeManySync(count);
                resolve({
                    ch,
                    values
                });
            }
            else if (selectedSpec.op === OperationType.PUT) {
                const {ch, value} = selectedSpec;
                ch.putSync(value, true);
                resolve({
                    ch
                });
            }
            else {
                const {ch, values} = selectedSpec;
                ch.putManySync(values, true);
                resolve({
                    ch
                });
            }
        };
        for(const spec of selectSpec) {
            spec.ch._select(spec, cb);
        }
    });

};
