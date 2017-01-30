import * as Promise from 'bluebird';

export const makePromise : <T>() => {
    promise: Promise<T>,
    resolve: (result: T) => void,
    reject: (err: any) => void } = <T>() => {
    let resolve: any = null, reject: any = null;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    })
    return { promise, resolve, reject };
};
