/// <reference path="../metahub.d.ts" />
/// <reference path="../ground.d.ts" />
/// <reference path="../vineyard.d.ts" />
/// <reference path="../node.d.ts" />
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
        public on: string[];
        constructor(fortress: Fortress);
        public check(user: Vineyard.IUser, resource, info): Promise;
    }
    class Admin extends Gate {
        public check(user: Vineyard.IUser, resource, info): Promise;
    }
    class User_Content extends Gate {
        private check_rows_ownership(user, rows);
        public check(user: Vineyard.IUser, resource, info): Promise;
        public limited_to_user(query: Ground.Query, user: Vineyard.IUser): boolean;
    }
}

declare module "fortress" {
  export = Fortress
}