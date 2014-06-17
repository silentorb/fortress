var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var fs = require('fs');
var when = require('when');
var Vineyard = require('vineyard');
var MetaHub = require('vineyard-metahub');
var Ground = require('vineyard-ground');

var Fortress = (function (_super) {
    __extends(Fortress, _super);
    function Fortress() {
        _super.apply(this, arguments);
    }
    Fortress.prototype.grow = function () {
        this.core = new Fortress.Core(this.config, this.ground);
    };

    Fortress.prototype.query_access = function (user, query) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        if (!user.roles)
            throw new Error('User passed to update_access is missing a roles array.');

        var test = this.core.prepare_query_test(query);

        var result = this.core.run(user, test);
        return when.resolve(result);
    };

    Fortress.prototype.update_access = function (user, updates) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        if (!user.roles)
            throw new Error('User passed to update_access is missing a roles array.');

        if (!MetaHub.is_array(updates))
            updates = [updates];

        return when.resolve(new Fortress.Result());
    };
    return Fortress;
})(Vineyard.Bulb);

var Fortress;
(function (Fortress) {
    var Core = (function () {
        function Core(bulb_config, ground) {
            this.gate_types = {};
            this.gates = [];
            this.log = false;
            this.ground = ground;
            this.gate_types['global'] = Global;
            this.gate_types['user_content'] = User_Content;
            this.gate_types['link'] = Link;
            var json = fs.readFileSync(bulb_config.config_path, 'ascii');
            var config = JSON.parse(json.toString());

            for (var i = 0; i < config.gates.length; ++i) {
                this.add_gate(config.gates[i]);
            }
        }
        Core.prototype.add_gate = function (source) {
            var type = this.gate_types[source.type];
            if (!type)
                throw new Error('Could not find gate: "' + source.type + '".');

            var gate = new type(this, source);
            this.gates.push(gate);
        };

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
            test.add_trellis(query.trellis, ['query']);

            test.fill_implicit();
            return test;
        };

        Core.prototype.prepare_update_test = function (user, query) {
            return null;
        };

        Core.prototype.run = function (user, test) {
            console.log(test.trellises);
            var user_gates = this.get_user_gates(user);
            var result = new Result();

            for (var i in test.trellises) {
                var trellis = test.trellises[i];
                var trellis_gates = user_gates.filter(function (gate) {
                    return trellis.is_possible_gate(gate);
                });
                if (trellis_gates.length == 0 || !this.check_trellis(user, trellis, trellis_gates)) {
                    result.walls.push(new Wall(trellis));
                    break;
                }

                for (var j in trellis.properties) {
                    var condition = trellis.properties[j];
                    if (condition.is_implicit && result.is_blacklisted(condition))
                        continue;

                    var property_gates = trellis_gates.filter(function (gate) {
                        return condition.is_possible_gate(gate);
                    });
                    if (property_gates.length == 0 || !this.check_property(user, condition, property_gates)) {
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

            console.log(result);
            return result;
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
            var _this = this;
            return this.gates.filter(function (gate) {
                return _this.user_has_any_role(user, gate.roles);
            });
        };
        return Core;
    })();
    Fortress.Core = Core;

    var Gate = (function (_super) {
        __extends(Gate, _super);
        function Gate(fortress, source) {
            _super.call(this);
            if (!source.roles || source.roles.length == 0)
                throw new Error('Each gate requires at least one role.');

            this.fortress = fortress;
            this.name = source.type;
            this.roles = source.roles;
            this.actions = source.actions;
            this.resources = source.resources;
        }
        Gate.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            return false;
        };
        return Gate;
    })(MetaHub.Meta_Object);
    Fortress.Gate = Gate;

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
    Fortress.Global = Global;

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

        Property_Condition.prototype.is_possible_gate = function (gate) {
            var resource = gate.resources[this.property.parent.name];
            return resource != undefined && (resource[0] == '*' || resource.indexOf(this.property.name) !== -1);
        };
        return Property_Condition;
    })();
    Fortress.Property_Condition = Property_Condition;

    var Trellis_Condition = (function () {
        function Trellis_Condition(trellis) {
            this.actions = [];
            this.trellis = trellis;
        }
        Trellis_Condition.prototype.fill_implicit = function () {
            var _this = this;
            if (!this.properties) {
                var properties = this.trellis.get_all_properties();
                this.properties = MetaHub.map(properties, function (p) {
                    return new Property_Condition(p, _this.actions, true);
                });
            }
        };

        Trellis_Condition.prototype.get_path = function () {
            return this.trellis.name;
        };

        Trellis_Condition.prototype.is_possible_gate = function (gate) {
            return gate.resources[this.trellis.name] != undefined;
        };
        return Trellis_Condition;
    })();
    Fortress.Trellis_Condition = Trellis_Condition;

    var Access_Test = (function () {
        function Access_Test() {
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
        };

        Access_Test.prototype.fill_implicit = function () {
            for (var i in this.trellises) {
                this.trellises[i].fill_implicit();
            }
        };
        return Access_Test;
    })();
    Fortress.Access_Test = Access_Test;

    var Prerequisite = (function () {
        function Prerequisite() {
        }
        return Prerequisite;
    })();
    Fortress.Prerequisite = Prerequisite;

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
    Fortress.User_Content = User_Content;

    var Link = (function (_super) {
        __extends(Link, _super);
        function Link(fortress, source) {
            _super.call(this, fortress, source);
            this.paths = source.paths.map(Ground.path_to_array);
        }
        return Link;
    })(Gate);
    Fortress.Link = Link;

    var Wall = (function () {
        function Wall(condition) {
            this.actions = [].concat(condition.actions);
            this.path = condition.get_path();
        }
        Wall.prototype.get_path = function () {
            return this.path;
        };
        return Wall;
    })();
    Fortress.Wall = Wall;

    var Result = (function () {
        function Result() {
            this.walls = [];
            this.blacklisted_trellis_properties = {};
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
        return Result;
    })();
    Fortress.Result = Result;
})(Fortress || (Fortress = {}));
require('source-map-support').install();
module.exports = Fortress;
//# sourceMappingURL=fortress.js.map
