/// <reference path="../vineyard/vineyard.d.ts" />
declare class Fortress extends Vineyard.Bulb {
    public core: Fortress.Core;
    public grow(): void;
    public query_access(user: Vineyard.IUser, query: Ground.Query_Builder): Promise;
    public update_access(user: Vineyard.IUser, updates: any): Promise;
}
declare module Fortress {
    interface Gate_Source {
        type: string;
        roles: string[];
        actions: string[];
        resources: any;
    }
    class Core {
        public gate_types: {};
        public gates: Gate[];
        public log: boolean;
        public ground: Ground.Core;
        constructor(bulb_config: any, ground: Ground.Core);
        public add_gate(source: Gate_Source): void;
        public get_roles(user: any): Promise;
        public user_has_role(user: any, role_name: string): boolean;
        public user_has_any_role(user: any, role_names: string[]): boolean;
        public prepare_query_test(query: Ground.Query_Builder): Access_Test;
        public prepare_update_test(user: Vineyard.IUser, query: Ground.Query_Builder): Access_Test;
        public run(user: Vineyard.IUser, test: Access_Test): Result;
        public check_trellis(user: Vineyard.IUser, trellis: Trellis_Condition, gates: Gate[]): boolean;
        public check_property(user: Vineyard.IUser, property: Property_Condition, gates: Gate[]): boolean;
        public get_user_gates(user: Vineyard.IUser): Gate[];
    }
    class Gate extends MetaHub.Meta_Object {
        public fortress: Fortress;
        public roles: string[];
        public resources: any;
        public actions: string[];
        public name: string;
        constructor(fortress: Fortress, source: Gate_Source);
        public check(user: Vineyard.IUser, resource: any, info?: any): boolean;
    }
    class Global extends Gate {
        public check(user: Vineyard.IUser, resource: any, info?: any): boolean;
    }
    interface ICondition {
        get_path(): string;
        actions: string[];
        is_possible_gate(gate: Gate): boolean;
    }
    class Property_Condition implements ICondition {
        public property: Ground.Property;
        public actions: string[];
        public is_implicit: boolean;
        constructor(property: Ground.Property, actions: string[], is_implicit?: boolean);
        public get_path(): string;
        public is_possible_gate(gate: Gate): boolean;
    }
    class Trellis_Condition implements ICondition {
        public trellis: Ground.Trellis;
        public actions: string[];
        public properties: {
            [key: string]: Property_Condition;
        };
        constructor(trellis: Ground.Trellis);
        public fill_implicit(): void;
        public get_path(): string;
        public is_possible_gate(gate: Gate): boolean;
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
        public limited_to_user(query: Ground.Query_Builder, user: Vineyard.IUser): boolean;
    }
    class Link extends Gate {
        public paths: string[];
        constructor(fortress: Fortress, source: any);
    }
    class Wall {
        public actions: string[];
        public path: string;
        constructor(condition: ICondition);
        public get_path(): string;
    }
    class Result {
        public walls: Wall[];
        public blacklisted_trellis_properties: {};
        public blacklist_implicit_property(condition: Property_Condition): void;
        public is_blacklisted(condition: Property_Condition): boolean;
    }
}
export = Fortress;
