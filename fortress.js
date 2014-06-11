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
        this.gate_types = {};
        this.gates = [];
        this.log = false;
    }
    Fortress.prototype.add_gate = function (source) {
        var type = this.gate_types[source.type];
        if (!type)
            throw new Error('Could not find gate: "' + source.type + '".');

        var gate = new type(this, source);
        this.gates.push(gate);
    };

    Fortress.prototype.get_roles = function (user) {
        return this.ground.trellises['user'].assure_properties(user, ['id', 'name', 'roles']);
    };

    Fortress.prototype.user_has_role = function (user, role_name) {
        for (var i in user.roles) {
            if (user.roles[i].name == role_name)
                return true;
        }
        return false;
    };

    Fortress.prototype.user_has_any_role = function (user, role_names) {
        for (var a in user.roles) {
            for (var b in role_names) {
                if (user.roles[a].name == role_names[b])
                    return true;
            }
        }
        return false;
    };

    Fortress.prototype.grow = function () {
        this.gate_types['global'] = Fortress.Global;
        this.gate_types['user_content'] = Fortress.User_Content;
        this.gate_types['link'] = Fortress.Link;
        var json = fs.readFileSync(this.config.config_path, 'ascii');
        var config = JSON.parse(json.toString());

        for (var i = 0; i < config.gates.length; ++i) {
            this.add_gate(config.gates[i]);
        }
    };

    Fortress.prototype.prepare_query_test = function (query) {
        var test = new Fortress.Access_Test();
        test.add_trellis(query.trellis, ['query']);

        test.fill_implicit();
        return test;
    };

    Fortress.prototype.prepare_update_test = function (user, query) {
        return null;
    };

    Fortress.prototype.query_access = function (user, query) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        if (!user.roles)
            throw new Error('User passed to update_access is missing a roles array.');

        var test = this.prepare_query_test(query);

        var result = this.run(test);
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

    Fortress.prototype.run = function (test) {
        var result = new Fortress.Result();

        return result;
    };
    return Fortress;
})(Vineyard.Bulb);

var Fortress;
(function (Fortress) {
    var Resource = (function () {
        function Resource() {
        }
        return Resource;
    })();
    Fortress.Resource = Resource;

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
        function Property_Condition(property, actions) {
            this.implicit = false;
            this.property = property;
            this.actions = actions;
        }
        Property_Condition.prototype.get_path = function () {
            return this.property.fullname();
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
                    return new Property_Condition(p, _this.actions);
                });
            }
        };

        Trellis_Condition.prototype.get_path = function () {
            return this.trellis.name;
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
        Link.prototype.check_path = function (path, user, resource) {
            var args, id = resource.get_primary_key_value();

            if (id === undefined)
                return when.resolve(false);

            if (path[0] == 'user')
                args = [user.id, id];
            else
                args = [id, user.id];

            return Ground.Query.query_path(path, args, this.fortress.ground);
        };

        Link.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            throw new Error('Not implemented.');
        };
        return Link;
    })(Gate);
    Fortress.Link = Link;

    var Result_Wall = (function () {
        function Result_Wall(condition) {
            this.actions = [].concat(condition.actions);
            this.path = condition.get_path();
        }
        Result_Wall.prototype.get_path = function () {
            return this.path;
        };
        return Result_Wall;
    })();
    Fortress.Result_Wall = Result_Wall;

    var Result = (function () {
        function Result() {
            this.walls = [];
        }
        return Result;
    })();
    Fortress.Result = Result;
})(Fortress || (Fortress = {}));
require('source-map-support').install();
module.exports = Fortress;
//# sourceMappingURL=fortress.js.map
