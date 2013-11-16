/// <reference path="metahub.d.ts" />
/// <reference path="ground.d.ts" />
/// <reference path="vineyard.d.ts" />
declare module Fortress {
    interface Gate {
        check(user: Vineyard.IUser, resource, info);
    }
}
declare class Fortress extends Vineyard.Bulb {
    public query_access(query: Ground.Query): Promise;
}
declare module "fortress" {
  export = Fortress
}