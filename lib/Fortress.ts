/// <reference path="../defs/metahub.d.ts"/>
/// <reference path="../defs/ground.d.ts"/>
/// <reference path="../defs/vineyard.d.ts"/>

module Fortress {
  export interface Gate {
    check(user:Vineyard.IUser, resource, info)
  }
}

class Fortress extends Vineyard.Bulb {
  query_access(query:Ground.Query):Promise {
    return when.resolve(false)
  }
}