/**
* User: Chris Johnson
* Date: 11/9/2014
*/
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/// <reference path="references.ts"/>
var when = require('when')
var Vineyard = require('vineyard')
var MetaHub = require('vineyard-metahub')
var Ground = require('vineyard-ground')
function this_only_exists_to_kick_typescript_to_keep_the_above_comments() {
}

var Gate = (function (_super) {
    __extends(Gate, _super);
    function Gate(source) {
        _super.call(this);

        //this.fortress = fortress
        this.name = source.type;
        this.actions = source.actions;
        this.resources = source.resources;
    }
    Gate.prototype.check = function (user, resource, info) {
        if (typeof info === "undefined") { info = null; }
        return false;
    };
    return Gate;
})(MetaHub.Meta_Object);

var Global = (function (_super) {
    __extends(Global, _super);
    function Global() {
        _super.apply(this, arguments);
    }
    Global.prototype.check = function (user, resource, info) {
        if (typeof info === "undefined") { info = null; }
        return true;
    };
    return Global;
})(Gate);

var Link = (function (_super) {
    __extends(Link, _super);
    function Link(source) {
        _super.call(this, source);
        this.paths = source.paths.map(Ground.path_to_array);
    }
    Link.prototype.check = function (user, resource, info) {
        if (typeof info === "undefined") { info = null; }
        return true;
    };
    return Link;
})(Gate);

var User_Content = (function (_super) {
    __extends(User_Content, _super);
    function User_Content() {
        _super.apply(this, arguments);
    }
    User_Content.prototype.check_rows_ownership = function (user, rows) {
        if (rows.length == 0)
            throw new Error('No records were found to check ownership.');
        for (var i = 0; i < rows.length; ++i) {
            var row = rows[i];
            if (row['author'] != user.id)
                return false;
        }
        return true;
    };

    User_Content.is_open_query = function (query) {
        var filters = query.filters.filter(function (filter) {
            return filter.path == query.trellis.primary_key;
        });
        return filters.length == 0;
    };

    User_Content.prototype.limited_to_user = function (query, user) {
        var filters = query.filters.filter(function (filter) {
            return filter.path == 'user';
        });
        if (filters.length !== 1)
            return false;

        return filters[0].value == user.id;
    };
    return User_Content;
})(Gate);
/**
* User: Chris Johnson
* Date: 11/9/2014
*/
/// <reference path="references.ts"/>

var Loader = (function () {
    function Loader() {
    }
    Loader.load = function (path) {
        Loader.gate_types['global'] = Global;
        Loader.gate_types['user_content'] = User_Content;
        Loader.gate_types['path'] = Link;

        var fs = require('fs');
        var json = fs.readFileSync(path, 'ascii');
        var config = JSON.parse(json.toString());

        var zones = [];
        for (var i = 0; i < config.zones.length; ++i) {
            var zone = this.create_zone(config.zones[i]);
            zones.push(zone);
        }

        return zones;
    };

    Loader.create_zone = function (source) {
        var zone = {
            roles: source.roles,
            gates: []
        };
        for (var i = 0; i < source.gates.length; ++i) {
            this.add_gate(zone, source.gates[i]);
        }

        return zone;
    };

    Loader.add_gate = function (zone, source) {
        var type = Loader.gate_types[source.type];
        if (!type)
            throw new Error('Could not find gate: "' + source.type + '".');

        var gate = new type(source);
        zone.gates.push(gate);
    };
    Loader.gate_types = {};
    return Loader;
})();
/**
* User: Chris Johnson
* Date: 11/9/2014
*/
/// <reference path="references.ts"/>
function run(user, test, core) {
    //console.log(test.trellises)
    var user_gates = core.get_user_gates(user);
    var result = new Result();

    for (var i in test.trellises) {
        var trellis_test = test.trellises[i];
        var trellis_gates = user_gates.filter(function (gate) {
            return trellis_test.is_possible_gate(gate);
        });
        if (trellis_gates.length == 0 || !core.check_trellis(user, trellis_test, trellis_gates)) {
            result.walls.push(new Wall(trellis_test));
            break;
        }

        for (var j in trellis_test.properties) {
            var condition = trellis_test.properties[j];
            if (condition.is_implicit && result.is_blacklisted(condition))
                continue;

            var property_gates = trellis_gates.filter(function (gate) {
                return condition.is_possible_gate(gate, trellis_test);
            });
            if (property_gates.length == 0 || !core.check_property(user, condition, property_gates)) {
                if (condition.is_implicit) {
                    if (condition.property.name != condition.property.parent.primary_key)
                        result.blacklist_implicit_property(condition);
                } else {
                    result.walls.push(new Wall(condition));
                    break;
                }
            }
        }
    }

    //console.log(result)
    return core.post_process_result(result);
}

var Trellis_Condition = (function () {
    function Trellis_Condition(trellis) {
        this.actions = [];
        this.properties = {};
        this.trellis = trellis;
    }
    Trellis_Condition.prototype.add_property = function (property, actions) {
        var primary_keys = this.trellis.get_primary_keys();
        for (var i = 0; i < primary_keys.length; ++i) {
            if (primary_keys[i].name == property.name)
                return;
        }

        this.properties[property.name] = new Property_Condition(property, actions);
    };

    Trellis_Condition.prototype.fill_implicit = function () {
        var _this = this;
        if (this.properties) {
            var primary_keys = this.trellis.get_primary_keys().map(function (p) {
                return p.name;
            });
            var properties = MetaHub.filter(this.trellis.get_all_properties(), function (p) {
                return primary_keys.indexOf(p.name) == -1;
            });

            this.properties = MetaHub.map(properties, function (p) {
                return new Property_Condition(p, _this.actions, true);
            });
        }
    };

    Trellis_Condition.prototype.get_path = function () {
        return this.trellis.name;
    };

    Trellis_Condition.prototype.is_possible_gate = function (gate, context) {
        if (typeof context === "undefined") { context = null; }
        if (gate.resources === '*' || gate.resources[0] === '*')
            return true;

        return gate.resources[this.trellis.name] != undefined;
    };

    Trellis_Condition.prototype.wall_message = function (action) {
        return 'You do not have permission to ' + action + " trellis '" + this.trellis.name + "'.";
    };
    return Trellis_Condition;
})();

var Property_Condition = (function () {
    function Property_Condition(property, actions, is_implicit) {
        if (typeof is_implicit === "undefined") { is_implicit = false; }
        this.property = property;
        this.actions = actions;
        this.is_implicit = is_implicit;
    }
    Property_Condition.prototype.get_path = function () {
        return this.property.fullname();
    };

    Property_Condition.prototype.is_possible_gate = function (gate, context) {
        if (gate.resources === '*' || gate.resources[0] === '*')
            return true;

        var resource = gate.resources[this.property.parent.name];
        if (resource == undefined) {
            // Test for child trellis permission
            var trellis_test = context;
            resource = gate.resources[trellis_test.trellis.name];
            if (resource == undefined)
                return false;
        }

        return resource[0] == '*' || resource.indexOf(this.property.name) !== -1;
    };

    Property_Condition.prototype.wall_message = function (action) {
        return 'You do not have permission to ' + action + " property '" + this.property.fullname() + "'.";
    };
    return Property_Condition;
})();

var Access_Test = (function () {
    function Access_Test() {
        //prerequisites:Prerequisite[]
        this.trellises = {};
    }
    Access_Test.prototype.add_trellis = function (trellis, actions) {
        if (!this.trellises[trellis.name]) {
            this.trellises[trellis.name] = new Trellis_Condition(trellis);
        }
        var entry = this.trellises[trellis.name];

        for (var i in actions) {
            var action = actions[i];
            if (entry.actions.indexOf(action) === -1)
                entry.actions.push(action);
        }

        return entry;
    };

    Access_Test.prototype.fill_implicit = function () {
        for (var i in this.trellises) {
            this.trellises[i].fill_implicit();
        }
    };
    return Access_Test;
})();

//class Prerequisite {
//
//}
var Wall = (function () {
    function Wall(condition) {
        this.actions = [].concat(condition.actions);
        this.path = condition.get_path();
        this.condition = condition;
    }
    Wall.prototype.get_path = function () {
        return this.path;
    };

    Wall.prototype.get_message = function () {
        return this.condition.wall_message(this.actions[0]);
    };
    return Wall;
})();

var Result = (function () {
    function Result() {
        this.walls = [];
        this.blacklisted_trellis_properties = {};
        this.is_allowed = false;
        this.additional_filters = [];
        this.post_actions = [];
    }
    Result.prototype.blacklist_implicit_property = function (condition) {
        var name = condition.property.parent.name;
        var trellis = this.blacklisted_trellis_properties[name] = this.blacklisted_trellis_properties[name] || [];
        trellis.push(condition.property.name);
    };

    Result.prototype.is_blacklisted = function (condition) {
        var name = condition.property.parent.name;
        var trellis_entry = this.blacklisted_trellis_properties[name];
        return trellis_entry && trellis_entry.indexOf(condition.property.name) > -1;
    };

    Result.prototype.get_message = function () {
        return "You are not authorized to perform this request: \n" + this.walls.map(function (wall) {
            return wall.get_message();
        }).join("\n");
    };

    Result.prototype.finalize = function () {
        this.is_allowed = this.walls.length == 0;
        return this;
    };

    Result.prototype.secure_query = function (query) {
        if (query.properties && Object.keys(query.properties).length > 0)
            return;

        var blacklist = [];
        for (var i in this.blacklisted_trellis_properties) {
            var trellis_entry = this.blacklisted_trellis_properties[i];
            blacklist = blacklist.concat(trellis_entry);
        }
        var properties = query.trellis.get_all_properties();
        var whitelist = [];
        for (var j in properties) {
            var property = properties[j];
            if (blacklist.indexOf(property.name) === -1)
                whitelist.push(property.name);
        }

        query.add_properties(whitelist);
    };
    return Result;
})();
/**
* User: Chris Johnson
* Date: 11/9/2014
*/
/// <reference path="references.ts"/>
var Core = (function () {
    function Core(bulb_config, ground) {
        this.gate_types = {};
        this.zones = [];
        this.log = false;
        this.ground = ground;
        this.zones = Loader.load(bulb_config.config_path);
    }
    Core.prototype.get_roles = function (user) {
        return this.ground.trellises['user'].assure_properties(user, ['id', 'name', 'roles']);
    };

    Core.prototype.user_has_role = function (user, role_name) {
        for (var i in user.roles) {
            if (user.roles[i].name == role_name)
                return true;
        }
        return false;
    };

    Core.prototype.user_has_any_role = function (user, role_names) {
        for (var a in user.roles) {
            for (var b in role_names) {
                if (user.roles[a].name == role_names[b])
                    return true;
            }
        }
        return false;
    };

    Core.prototype.prepare_query_test = function (query) {
        var test = new Access_Test();
        var condition = test.add_trellis(query.trellis, ['query']);
        if (query.filters) {
            this.prepare_query_filters(query.filters, condition, query);
        }
        if (query.properties) {
            for (var name in query.properties) {
                var property = query.trellis.get_all_properties()[name];
                condition.add_property(property, ['query']);
            }
        }

        test.fill_implicit();
        return test;
    };

    Core.prototype.prepare_query_filters = function (filters, condition, query) {
        for (var i = 0; i < filters.length; ++i) {
            var filter = filters[i];
            if (filter.type == 'or' || filter.type == 'and') {
                this.prepare_query_filters(filter.filters, condition, query);
                continue;
            }

            var path = filter.path || filter.property.name;
            if (!path)
                continue;

            path = path.split('.')[0];
            var properties = query.trellis.get_all_properties();
            var property = properties[path];
            if (!property)
                throw new Error('Could not find ' + path);

            if (property.parent.name == query.trellis.name) {
                condition.add_property(property, ['query']);
            }
        }
    };

    Core.prototype.prepare_update_test = function (updates) {
        var test = new Access_Test();
        var trellises = {};
        for (var i = 0; i < updates.length; ++i) {
            var trellis = updates[i].trellis;
            if (!trellises[trellis.name])
                trellises[trellis.name] = trellis;
        }

        for (var name in trellises) {
            var condition = test.add_trellis(trellises[name], ['update']);
        }

        //if (query.properties) {
        //  for (var name in query.properties) {
        //    var property = query.trellis.properties[name]
        //    condition.add_property(property, ['query'])
        //  }
        //}
        //test.fill_implicit()
        return test;
    };

    Core.prototype.post_process_result = function (result) {
        if (result.post_actions.length == 0 || result.walls.length > 0)
            return when.resolve(result.finalize());

        var promises = result.post_actions.concat(function () {
            return result.finalize();
        });
        var pipeline = require('when/pipeline');
        return pipeline(promises);
    };

    Core.prototype.check_trellis = function (user, trellis, gates) {
        for (var j in gates) {
            var gate = gates[j];
            if (gate.check(user, trellis))
                return true;
        }
        return false;
    };

    Core.prototype.check_property = function (user, property, gates) {
        for (var j in gates) {
            var gate = gates[j];
            if (gate.check(user, property))
                return true;
        }
        return false;
    };

    Core.prototype.get_user_gates = function (user) {
        var result = [];
        for (var i = 0; i < this.zones.length; ++i) {
            var zone = this.zones[i];
            if (this.user_has_any_role(user, zone.roles))
                result = result.concat(zone.gates);
        }
        return result;
    };

    Core.find_filter = function (query, path) {
        if (!query.filters)
            return null;

        for (var i = 0; i < query.filters.length; ++i) {
            var filter = query.filters[i];
            if (filter.path == path)
                return filter;
        }

        return null;
    };
    return Core;
})();
/**
* User: Chris Johnson
* Date: 11/9/2014
*/
/// <reference path="references.ts"/>
var Fortress = (function (_super) {
    __extends(Fortress, _super);
    function Fortress() {
        _super.apply(this, arguments);
    }
    Fortress.prototype.grow = function () {
        this.core = new Core(this.config, this.ground);
    };

    Fortress.prototype.query_access = function (user, query) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        if (!user.roles)
            throw new Error('User passed to update_access is missing a roles array.');

        var test = this.core.prepare_query_test(query);

        return run(user, test, this.core);
        //return when.resolve(result)
    };

    Fortress.prototype.update_access = function (user, updates) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        if (!user.roles)
            throw new Error('User passed to update_access is missing a roles array.');

        if (!MetaHub.is_array(updates))
            updates = [updates];

        var test = this.core.prepare_update_test(updates);

        return run(user, test, this.core);
    };

    Fortress.prototype.user_has_role = function (user, role_name) {
        for (var i in user.roles) {
            if (user.roles[i].name == role_name)
                return true;
        }
        return false;
    };
    return Fortress;
})(Vineyard.Bulb);
/**
* User: Chris Johnson
* Date: 11/9/2014
*/
/// <reference path="references.ts"/>
module.exports = Fortress
function typescript_bulb_export_hack() {
}
//# sourceMappingURL=fortress.js.map
