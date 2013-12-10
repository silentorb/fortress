
interface Deferred {
  promise: Promise;
  resolve(arg);
  reject(reason);
}

interface Promise {
  then(...args:any[]):Promise;
  map(...args:any[]):Promise;
}
declare module "when" {

  function defer(): Deferred;
  function map(list, action);
  function all(list);
}