/// <reference path="../vineyard/vineyard.d.ts" />
declare class Fortress extends Vineyard.Bulb {
    public gate_types: {};
    public gates: Fortress.Gate[];
    public log: boolean;
    public add_gate(source: Fortress.Gate_Source): void;
    public get_roles(user: any): Promise;
    public user_has_role(user: any, role_name: string): boolean;
    public user_has_any_role(user: any, role_names: string[]): boolean;
    public grow(): void;
    public prepare_query_test(query: Ground.Query_Builder): Fortress.Access_Test;
    public prepare_update_test(user: Vineyard.IUser, query: Ground.Query_Builder): Fortress.Access_Test;
    public query_access(user: Vineyard.IUser, query: Ground.Query_Builder): Promise;
    public update_access(user: Vineyard.IUser, updates: any): Promise;
    public run(test: Fortress.Access_Test): Fortress.Result;
}
declare module Fortress {
    interface Gate_Source {
        type: string;
        roles: string[];
        actions: string[];
        resources: any[];
    }
    class Resource {
        public trellis: Ground.Trellis;
        public properties: Ground.Property[];
    }
    class Gate extends MetaHub.Meta_Object {
        public fortress: Fortress;
        public roles: string[];
        public resources: Resource[];
        public actions: string[];
        public name: string;
        constructor(fortress: Fortress, source: Gate_Source);
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
    class Global extends Gate {
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
    class Property_Condition {
        public property: Ground.Property;
        public actions: string[];
        public implicit: boolean;
        constructor(property: Ground.Property, actions: string[]);
    }
    class Trellis_Condition {
        public trellis: Ground.Trellis;
        public actions: string[];
        public properties: {
            [key: string]: Property_Condition;
        };
        constructor(trellis: Ground.Trellis);
        public fill_implicit(): void;
    }
    class Access_Test {
        public prerequisites: Prerequisite[];
        public trellises: {
            [key: string]: Trellis_Condition;
        };
        public add_trellis(trellis: Ground.Trellis, actions: string[]): void;
        public fill_implicit(): void;
    }
    class Prerequisite {
    }
    class User_Content extends Gate {
        private check_rows_ownership(user, rows);
        private static is_open_query(query);
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
        public limited_to_user(query: Ground.Query_Builder, user: Vineyard.IUser): boolean;
    }
    class Link extends Gate {
        public paths: string[];
        constructor(fortress: Fortress, source: any);
        public check_path(path: string, user: Vineyard.IUser, resource: any): Promise;
        public check(user: Vineyard.IUser, resource: any, info?: any): Promise;
    }
    class Result_Wall {
    }
    class Result {
        public walls: Result_Wall[];
    }
}
export = Fortress;
