/// <reference path="../defs/metahub.d.ts" />
/// <reference path="../defs/ground.d.ts" />
/// <reference path="../defs/vineyard.d.ts" />
/// <reference path="../defs/node.d.ts" />
declare class Fortress extends Vineyard.Bulb {
    public gate_types: {};
    public gates: Fortress.Gate[];
    public add_gate(source: Fortress.Gate_Source): void;
    public get_roles(user): Promise;
    public user_has_role(user, role_name): Promise;
    public grow(): void;
    public query_access(user: Vineyard.IUser, query: Ground.Query): Promise;
    public atomic_access(user: Vineyard.IUser, resource, actions?: string[]);
    public update_access(user: Vineyard.IUser, updates): Promise;
}
declare module Fortress {
    interface Gate_Source {
        type: string;
        on: string[];
    }
    class Gate extends MetaHub.Meta_Object {
        public fortress: Fortress;
        constructor(fortress: Fortress);
        public check(user: Vineyard.IUser, resource, info): Promise;
    }
    class Admin extends Gate {
        public check(user: Vineyard.IUser, resource, info): Promise;
    }
    class User_Content extends Gate {
        public check(user: Vineyard.IUser, resource, info): Promise;
    }
}
export = Fortress;
