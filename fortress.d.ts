/// <reference path="metahub.d.ts" />
/// <reference path="ground.d.ts" />
/// <reference path="vineyard.d.ts" />
/// <reference path="node.d.ts" />
declare var fs: any;
declare class Fortress extends Vineyard.Bulb {
    public gate_types: {};
    public gates: Fortress.Gate[];
    public add_gate(source: Fortress.Gate_Source): void;
    public get_roles(user: any): Promise;
    public user_has_role(user: any, role_name: string): boolean;
    public user_has_any_role(user: any, role_names: string[]): boolean;
    public grow(): void;
    public select_gates(user: any, patterns: any): Fortress.Gate[];
    public atomic_access(user: Vineyard.IUser, resource: any, actions?: string[]): any;
    public get_explicit_query_properties(query: Ground.Query): any[];
    public get_query_events(query: Ground.Query): any[];
    private get_query_and_subqueries(user, query);
    public query_access(user: Vineyard.IUser, query: Ground.Query): Promise;
    public update_access(user: Vineyard.IUser, updates: any): Promise;
    static sequential_check(list: any[], next: (arg: any) => Promise, check: any): Promise;
}
declare module Fortress {
    interface Gate_Source {
        type: string;
        on: string[];
    }
    class Gate extends MetaHub.Meta_Object {
        public fortress: Fortress;
        public roles: string[];
        public on: string[];
        constructor(fortress: Fortress, source: any);
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
    class Admin extends Gate {
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
    class User_Content extends Gate {
        private check_rows_ownership(user, rows);
        private static is_open_query(query);
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
        public limited_to_user(query: Ground.Query, user: Vineyard.IUser): boolean;
    }
    class Link extends Gate {
        public paths: string[];
        constructor(fortress: Fortress, source: any);
        public check_path(path: string, user: Vineyard.IUser, resource: any): Promise;
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
}
declare module "fortress" {
  export = Fortress
}